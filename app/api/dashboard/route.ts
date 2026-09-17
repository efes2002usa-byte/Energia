import { buildCalculation } from "@/app/api/reconciliation/route";
import { ensureReferenceData, getD1 } from "@/lib/device-db";
import { ensureMainMeter, errorResponse, microsToDecimal, validateDate, ValidationError } from "@/lib/energy-db";

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function readRange(request: Request) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const to = validateDate(url.searchParams.get("to") ?? today);
  const from = validateDate(url.searchParams.get("from") ?? addDays(to, -29));
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  if (span < 0 || span > 31) throw new ValidationError("INVALID_RANGE", "Период Dashboard должен быть от 1 до 32 дней");
  return { from, to };
}

function localNow(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

function isCompleted(date: string, hour: number, now: { date: string; hour: number }) {
  return date < now.date || (date === now.date && hour < now.hour);
}

function sumNullable<T>(rows: T[], value: (row: T) => number | null) {
  if (rows.some(row => value(row) === null)) return null;
  return rows.reduce((sum, row) => sum + (value(row) ?? 0), 0);
}

export async function GET(request: Request) {
  try {
    const { from, to } = readRange(request);
    const db = getD1();
    await Promise.all([ensureReferenceData(db), ensureMainMeter(db)]);
    const calculation = await buildCalculation(db, from, to);
    const now = localNow(calculation.settings.timezone);
    const rows = calculation.allRows.filter(row => isCompleted(row.date, row.hour, now));
    const coveredRows = rows.filter(row => row.actualMicros !== null);
    const actualMicros = coveredRows.reduce((sum, row) => sum + (row.actualMicros ?? 0), 0);
    const devicesMicros = rows.reduce((sum, row) => sum + row.devicesMicros, 0);
    const unallocatedRows = rows.filter(row => row.deltaMicros !== null && row.deltaMicros > 0);
    const unallocatedMicros = unallocatedRows.reduce((sum, row) => sum + (row.deltaMicros ?? 0), 0);
    const actualCostMicros = sumNullable(coveredRows, row => row.actualCostMicros);
    const deviceRows = rows.filter(row => row.devicesMicros > 0);
    const devicesCostMicros = sumNullable(deviceRows, row => row.devicesCostMicros);
    const unallocatedCostMicros = sumNullable(unallocatedRows, row => row.unallocatedCostMicros);

    const dailyMap = new Map<string, { actualMicros: number; devicesMicros: number; actualHours: number; completedHours: number }>();
    for (const row of rows) {
      const day = dailyMap.get(row.date) ?? { actualMicros: 0, devicesMicros: 0, actualHours: 0, completedHours: 0 };
      day.completedHours += 1;
      day.devicesMicros += row.devicesMicros;
      if (row.actualMicros !== null) {
        day.actualMicros += row.actualMicros;
        day.actualHours += 1;
      }
      dailyMap.set(row.date, day);
    }
    const daily = Array.from(dailyMap, ([date, day]) => ({
      date,
      actualKwh: day.actualHours ? Number(microsToDecimal(day.actualMicros)) : null,
      devicesKwh: Number(microsToDecimal(day.devicesMicros)),
      actualHours: day.actualHours,
      completedHours: day.completedHours,
      complete: day.actualHours === day.completedHours,
    }));
    const daysWithFact = daily.filter(day => day.actualKwh !== null);
    const maximumDay = daysWithFact.reduce<(typeof daily)[number] | null>((best, day) => !best || day.actualKwh! > best.actualKwh! ? day : best, null);
    const minimumDay = daysWithFact.reduce<(typeof daily)[number] | null>((best, day) => !best || day.actualKwh! < best.actualKwh! ? day : best, null);
    const maximumHour = coveredRows.reduce<(typeof rows)[number] | null>((best, row) => !best || row.actualMicros! > best.actualMicros! ? row : best, null);

    const aggregate = (field: "category" | "zone") => Array.from(rows.flatMap(row => row.details).reduce((map, detail) => {
      const name = detail[field];
      map.set(name, (map.get(name) ?? 0) + detail.energyMicros);
      return map;
    }, new Map<string, number>()), ([name, energyMicros]) => ({ name, energyKwh: Number(microsToDecimal(energyMicros)) }))
      .sort((left, right) => right.energyKwh - left.energyKwh);

    const alerts = rows.filter(row => row.status !== "NORMAL").slice(-12).reverse().map(row => ({
      date: row.date,
      hour: row.hour,
      status: row.status,
      actualKwh: row.actualKwh,
      devicesKwh: row.devicesKwh,
      deltaKwh: row.deltaKwh,
      errorMessage: row.errorMessage,
    }));
    const lastCalculation = await db.prepare(`SELECT MAX(calculated_at) AS calculated_at FROM hourly_reconciliation`).first<{ calculated_at: string | null }>();

    return Response.json({
      from,
      to,
      generatedAt: new Date().toISOString(),
      lastCalculatedAt: lastCalculation?.calculated_at ?? null,
      settings: calculation.settings,
      summary: {
        actualKwh: microsToDecimal(actualMicros),
        devicesKwh: microsToDecimal(devicesMicros),
        unallocatedKwh: microsToDecimal(unallocatedMicros),
        unallocatedPercent: actualMicros > 0 ? unallocatedMicros / actualMicros * 100 : null,
        actualCost: actualCostMicros === null ? null : microsToDecimal(actualCostMicros),
        devicesCost: devicesCostMicros === null ? null : microsToDecimal(devicesCostMicros),
        unallocatedCost: unallocatedCostMicros === null ? null : microsToDecimal(unallocatedCostMicros),
        completedHours: rows.length,
        totalHours: calculation.allRows.length,
        coveredHours: coveredRows.length,
        coveragePercent: rows.length ? coveredRows.length / rows.length * 100 : 0,
        incomplete: rows.length < calculation.allRows.length || coveredRows.length < rows.length || calculation.errors.length > 0,
      },
      extrema: {
        averageDayKwh: daysWithFact.length ? Number(microsToDecimal(actualMicros)) / daysWithFact.length : null,
        maximumDay,
        minimumDay,
        maximumHour: maximumHour ? { date: maximumHour.date, hour: maximumHour.hour, actualKwh: Number(maximumHour.actualKwh) } : null,
      },
      daily,
      byCategory: aggregate("category"),
      byZone: aggregate("zone"),
      alerts,
      errors: calculation.errors,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
