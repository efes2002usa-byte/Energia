import { buildCalculation } from "@/app/api/reconciliation/route";
import { ensureReferenceData, getD1 } from "@/lib/device-db";
import { ensureMainMeter, errorResponse, microsToDecimal, validateDate, ValidationError } from "@/lib/energy-db";
import { logApiDuration } from "@/lib/metrics";

type Row = Awaited<ReturnType<typeof buildCalculation>>["allRows"][number];
type Detail = Row["details"][number];

function addDays(date: string, amount: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function readDate(value: string | null, fallback: string) { return validateDate(value ?? fallback); }
function readRange(request: Request, fromKey = "from", toKey = "to") {
  const url = new URL(request.url); const today = new Date().toISOString().slice(0, 10);
  const to = readDate(url.searchParams.get(toKey), today); const from = readDate(url.searchParams.get(fromKey), addDays(to, -29));
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  if (span < 0 || span > 31) throw new ValidationError("INVALID_RANGE", "Период аналитики должен быть от 1 до 32 дней");
  return { from, to };
}
function localNow(timezone: string) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()); const value = Object.fromEntries(parts.map(part => [part.type, part.value])); return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) }; }
function completed(row: Row, now: { date: string; hour: number }) { return row.date < now.date || (row.date === now.date && row.hour < now.hour); }
function selectedDetails(row: Row, filters: { devices: Set<string>; categories: Set<string>; zones: Set<string> }) { return row.details.filter(detail => (!filters.devices.size || filters.devices.has(detail.deviceId)) && (!filters.categories.size || filters.categories.has(detail.categoryId)) && (!filters.zones.size || filters.zones.has(detail.zoneId))); }
function filterSet(value: string | null) { return new Set((value ?? "").split(",").map(item => item.trim()).filter(Boolean)); }
function aggregate(rows: Row[], filters: { devices: Set<string>; categories: Set<string>; zones: Set<string> }) {
  const devices = new Map<string, { id: string; name: string; energyMicros: number }>(); const categories = new Map<string, { id: string; name: string; energyMicros: number }>(); const zones = new Map<string, { id: string; name: string; energyMicros: number }>();
  for (const row of rows) for (const detail of selectedDetails(row, filters)) {
    const device = devices.get(detail.deviceId) ?? { id: detail.deviceId, name: detail.name, energyMicros: 0 }; device.energyMicros += detail.energyMicros; devices.set(detail.deviceId, device);
    const category = categories.get(detail.categoryId) ?? { id: detail.categoryId, name: detail.category, energyMicros: 0 }; category.energyMicros += detail.energyMicros; categories.set(detail.categoryId, category);
    const zone = zones.get(detail.zoneId) ?? { id: detail.zoneId, name: detail.zone, energyMicros: 0 }; zone.energyMicros += detail.energyMicros; zones.set(detail.zoneId, zone);
  }
  const serialize = (items: Map<string, { id: string; name: string; energyMicros: number }>) => Array.from(items.values()).map(item => ({ id: item.id, name: item.name, energyKwh: microsToDecimal(item.energyMicros) })).sort((left, right) => Number(right.energyKwh) - Number(left.energyKwh));
  return { devices: serialize(devices), categories: serialize(categories), zones: serialize(zones) };
}
function nightHour(hour: number, from: number, to: number) { return from <= to ? hour >= from && hour < to : hour >= from || hour < to; }

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const { from, to } = readRange(request); const url = new URL(request.url);
    const db = getD1(); await Promise.all([ensureReferenceData(db), ensureMainMeter(db)]);
    const calculation = await buildCalculation(db, from, to); const now = localNow(calculation.settings.timezone);
    const filters = { devices: filterSet(url.searchParams.get("devices")), categories: filterSet(url.searchParams.get("categories")), zones: filterSet(url.searchParams.get("zones")) };
    const requestedQuality = url.searchParams.get("quality") ?? "ALL";
    const rows = calculation.allRows.filter(row => completed(row, now)).map(row => ({ ...row, details: selectedDetails(row, filters) })).filter(row => requestedQuality === "ALL" || row.quality === requestedQuality);
    const actualRows = rows.filter(row => row.actualMicros !== null); const actualMicros = actualRows.reduce((sum, row) => sum + (row.actualMicros ?? 0), 0); const devicesMicros = rows.reduce((sum, row) => sum + row.details.reduce((sum, detail) => sum + detail.energyMicros, 0), 0);
    const daily = Array.from(new Set(rows.map(row => row.date))).map(date => { const dayRows = rows.filter(row => row.date === date); const facts = dayRows.filter(row => row.actualMicros !== null); return { date, actualKwh: facts.length ? microsToDecimal(facts.reduce((sum, row) => sum + (row.actualMicros ?? 0), 0)) : null, devicesKwh: microsToDecimal(dayRows.reduce((sum, row) => sum + row.details.reduce((sum, detail) => sum + detail.energyMicros, 0), 0)), coveredHours: facts.length, completedHours: dayRows.length }; });
    const heatmap = rows.map(row => ({ date: row.date, hour: row.hour, actualKwh: row.actualKwh, devicesKwh: microsToDecimal(row.details.reduce((sum, detail) => sum + detail.energyMicros, 0)), quality: row.quality, status: row.status }));
    const nightFrom = calculation.settings.closedFromHour; const nightTo = calculation.settings.closedToHour; const nightRows = rows.filter(row => nightHour(row.hour, nightFrom, nightTo)); const nightActualMicros = nightRows.reduce((sum, row) => sum + (row.actualMicros ?? 0), 0); const nightDevicesMicros = nightRows.reduce((sum, row) => sum + row.details.reduce((sum, detail) => sum + detail.energyMicros, 0), 0);
    const second = url.searchParams.has("compareFrom") || url.searchParams.has("compareTo") ? readRange(request, "compareFrom", "compareTo") : { from: addDays(from, -(Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1)), to: addDays(from, -1) };
    const previous = await buildCalculation(db, second.from, second.to); const previousRows = previous.allRows.filter(row => completed(row, localNow(previous.settings.timezone))).map(row => ({ ...row, details: selectedDetails(row, filters) })); const previousActualMicros = previousRows.reduce((sum, row) => sum + (row.actualMicros ?? 0), 0); const previousDevicesMicros = previousRows.reduce((sum, row) => sum + row.details.reduce((sum, detail) => sum + detail.energyMicros, 0), 0);
    const currentAgg = aggregate(rows, filters); const previousAgg = aggregate(previousRows, filters); const previousByCategory = new Map(previousAgg.categories.map(item => [item.id, Number(item.energyKwh)])); const categoryContribution = currentAgg.categories.map(item => ({ ...item, previousEnergyKwh: previousByCategory.get(item.id) ?? "0", changeKwh: Number(item.energyKwh) - (previousByCategory.get(item.id) ?? 0) }));
    const response = Response.json({ from, to, settings: calculation.settings, filters: { quality: requestedQuality }, options: { devices: currentAgg.devices, categories: currentAgg.categories, zones: currentAgg.zones }, summary: { actualKwh: microsToDecimal(actualMicros), devicesKwh: microsToDecimal(devicesMicros), coveragePercent: rows.length ? actualRows.length / rows.length * 100 : 0, completedHours: rows.length, coveredHours: actualRows.length, incomplete: rows.length < calculation.allRows.length || actualRows.length < rows.length, actualCost: actualRows.length && actualRows.every(row => row.actualCostMicros !== null) ? microsToDecimal(actualRows.reduce((sum, row) => sum + (row.actualCostMicros ?? 0), 0)) : null }, daily, heatmap, byDevice: currentAgg.devices, byCategory: currentAgg.categories, byZone: currentAgg.zones, night: { from: nightFrom, to: nightTo, actualKwh: microsToDecimal(nightActualMicros), devicesKwh: microsToDecimal(nightDevicesMicros), sharePercent: actualMicros ? nightActualMicros / actualMicros * 100 : null }, compare: { from: second.from, to: second.to, actualKwh: microsToDecimal(previousActualMicros), devicesKwh: microsToDecimal(previousDevicesMicros), actualChangePercent: previousActualMicros ? (actualMicros - previousActualMicros) / previousActualMicros * 100 : null, categoryContribution }, errors: calculation.errors });
    logApiDuration("analytics", startedAt);
    return response;
  } catch (error) { logApiDuration("analytics", startedAt, error instanceof ValidationError ? error.status : 500); return errorResponse(error); }
}
