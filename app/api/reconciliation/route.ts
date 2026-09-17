import { consumptionKwh, ensureReferenceData, getD1, weekdayForDate } from "@/lib/device-db";
import { ensureMainMeter, errorResponse, MAIN_METER_ID, microsToDecimal, slotDate, slotFromDate, validateDate, ValidationError } from "@/lib/energy-db";
import { getAppSettings, settingsDto } from "@/lib/settings-db";
import { assertRangeEditable } from "@/lib/day-workflow";

type Reading = { reading_date: string; reading_hour: number; value_micros: number };
type Manual = { date: string; hour: number; consumption_micros: number };
type Tariff = { id: string; valid_from_date: string; price_micros: number };
type BaseDevice = { id: string; name: string; active_from_date: string; inactive_from_date: string | null };
type EffectiveDevice = {
  placement_version_id: string | null; consumption_version_id: string | null;
  zone_id: string | null; zone_name: string | null; category_id: string | null; category_name: string | null;
  mode: "HOURLY_AVERAGE" | "POWER_FACTOR" | null;
  consumption_per_hour_micros: number | null; nominal_power_micros: number | null;
  load_factor_ppm: number | null; quantity: number | null;
};
type DeviceDetail = {
  deviceId: string; name: string; zoneId: string; zone: string; categoryId: string; category: string;
  consumptionVersionId: string; placementVersionId: string; energyMicros: number; energyKwh: string; formula: string;
};

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function dateRange(from: string, to: string) {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function slotsForRange(from: string, to: string) {
  return dateRange(from, to).flatMap(date => Array.from({ length: 24 }, (_, hour) => ({ date, hour })));
}

function costMicros(energyMicros: number, priceMicros: number) {
  return Math.round(energyMicros * priceMicros / 1_000_000);
}

function readRange(request: Request) {
  const url = new URL(request.url);
  const to = validateDate(url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10));
  const from = validateDate(url.searchParams.get("from") ?? to);
  const span = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
  if (span < 0 || span > 31) throw new ValidationError("INVALID_RANGE", "Период должен быть от 1 до 31 дня");
  return { from, to };
}

async function calculateInterval(db: D1Database, left: Reading, right: Reading) {
  const start = slotDate(left.reading_date, left.reading_hour);
  const intervalHours = Math.round((slotDate(right.reading_date, right.reading_hour).getTime() - start.getTime()) / 3_600_000);
  if (intervalHours < 1 || intervalHours > 744 || right.value_micros < left.value_micros) return [];
  const manuals = await db.prepare(`SELECT date, hour, consumption_micros FROM manual_hourly_consumption
    WHERE meter_id = ? AND (date > ? OR (date = ? AND hour >= ?)) AND (date < ? OR (date = ? AND hour < ?)) ORDER BY date, hour`)
    .bind(MAIN_METER_ID, left.reading_date, left.reading_date, left.reading_hour, right.reading_date, right.reading_date, right.reading_hour).all<Manual>();
  const manualBySlot = new Map(manuals.results.map(row => [`${row.date}:${row.hour}`, row]));
  const delta = right.value_micros - left.value_micros;
  const manualSum = manuals.results.reduce((sum, row) => sum + row.consumption_micros, 0);
  const automaticCount = intervalHours - manuals.results.length;
  if (manualSum > delta || automaticCount < 0 || (automaticCount === 0 && manualSum !== delta)) return [];
  const base = automaticCount ? Math.floor((delta - manualSum) / automaticCount) : 0;
  let remainder = automaticCount ? delta - manualSum - base * automaticCount : 0;
  const result: Array<{ date: string; hour: number; actualMicros: number; quality: string }> = [];
  for (let index = 0; index < intervalHours; index += 1) {
    const slot = slotFromDate(new Date(start.getTime() + index * 3_600_000));
    const manual = manualBySlot.get(`${slot.date}:${slot.hour}`);
    let actualMicros = manual?.consumption_micros ?? base;
    if (!manual && remainder > 0) {
      const laterAutomatic = Array.from({ length: intervalHours - index - 1 }, (_, offset) => {
        const later = slotFromDate(new Date(start.getTime() + (index + offset + 1) * 3_600_000));
        return !manualBySlot.has(`${later.date}:${later.hour}`);
      }).some(Boolean);
      if (!laterAutomatic) { actualMicros += remainder; remainder = 0; }
    }
    result.push({ ...slot, actualMicros, quality: manual ? "MANUAL" : intervalHours === 1 ? "EXACT" : "INTERPOLATED" });
  }
  return result;
}

export async function buildCalculation(db: D1Database, from: string, to: string) {
  const appSettings = await getAppSettings(db);
  const absoluteToleranceMicros = appSettings.absolute_tolerance_micros;
  const percentTolerance = appSettings.percentage_tolerance_micros / 1_000_000;
  const readings = await db.prepare(`SELECT reading_date, reading_hour, value_micros FROM meter_readings WHERE meter_id = ? ORDER BY reading_date, reading_hour`).bind(MAIN_METER_ID).all<Reading>();
  const tariffs = await db.prepare(`SELECT id, valid_from_date, price_micros FROM tariff_versions WHERE valid_from_date <= ? ORDER BY valid_from_date`).bind(to).all<Tariff>();
  const actual = new Map<string, { micros: number; quality: string }>();
  for (let index = 0; index < readings.results.length - 1; index += 1) {
    for (const item of await calculateInterval(db, readings.results[index], readings.results[index + 1])) {
      if (item.date >= from && item.date <= to) actual.set(`${item.date}:${item.hour}`, { micros: item.actualMicros, quality: item.quality });
    }
  }
  const devices = await db.prepare(`SELECT id, name, active_from_date, inactive_from_date FROM devices
    WHERE is_archived = 0 AND active_from_date <= ? AND (inactive_from_date IS NULL OR inactive_from_date > ?) ORDER BY name COLLATE NOCASE`)
    .bind(to, from).all<BaseDevice>();
  const details = new Map<string, DeviceDetail[]>();
  const calculationErrors = new Map<string, string[]>();
  const errors: string[] = [];
  for (const date of dateRange(from, to)) {
    for (const device of devices.results) {
      if (date < device.active_from_date || (device.inactive_from_date && date >= device.inactive_from_date)) continue;
      const marker = await db.prepare(`SELECT 1 AS present FROM device_schedule_days WHERE device_id = ? AND date = ?`).bind(device.id, date).first<{ present: number }>();
      const onHours = marker
        ? await db.prepare(`SELECT hour FROM device_on_hour WHERE device_id = ? AND date = ? ORDER BY hour`).bind(device.id, date).all<{ hour: number }>()
        : await db.prepare(`SELECT hour FROM device_default_schedule WHERE device_id = ? AND weekday = ? ORDER BY hour`).bind(device.id, weekdayForDate(date)).all<{ hour: number }>();
      const effective = await db.prepare(`SELECT
        pv.id AS placement_version_id, pv.zone_id, z.name AS zone_name, pv.category_id, c.name AS category_name,
        cv.id AS consumption_version_id, cv.mode, cv.consumption_per_hour_micros, cv.nominal_power_micros, cv.load_factor_ppm, cv.quantity
        FROM devices d
        LEFT JOIN device_placement_versions pv ON pv.id = (SELECT id FROM device_placement_versions WHERE device_id = d.id AND valid_from_date <= ? ORDER BY valid_from_date DESC LIMIT 1)
        LEFT JOIN zones z ON z.id = pv.zone_id LEFT JOIN device_categories c ON c.id = pv.category_id
        LEFT JOIN device_consumption_versions cv ON cv.id = (SELECT id FROM device_consumption_versions WHERE device_id = d.id AND valid_from_date <= ? ORDER BY valid_from_date DESC LIMIT 1)
        WHERE d.id = ?`).bind(date, date, device.id).first<EffectiveDevice>();
      if (!effective?.placement_version_id || !effective.consumption_version_id || !effective.zone_id || !effective.category_id || !effective.zone_name || !effective.category_name || !effective.mode || !effective.quantity) {
        const message = `${device.name} (${date}): отсутствует обязательная версия размещения или потребления`;
        errors.push(message);
        for (const { hour } of onHours.results) {
          const key = `${date}:${hour}`;
          calculationErrors.set(key, [...(calculationErrors.get(key) ?? []), message]);
        }
        continue;
      }
      const energyMicros = consumptionKwh({ mode: effective.mode, consumption_per_hour_micros: effective.consumption_per_hour_micros, nominal_power_micros: effective.nominal_power_micros, load_factor_ppm: effective.load_factor_ppm, quantity: effective.quantity });
      const formula = effective.mode === "HOURLY_AVERAGE"
        ? `C × N = ${microsToDecimal(effective.consumption_per_hour_micros ?? 0)} × ${effective.quantity}`
        : `P × K × N = ${microsToDecimal(effective.nominal_power_micros ?? 0)} × ${microsToDecimal(effective.load_factor_ppm ?? 0)} × ${effective.quantity}`;
      for (const { hour } of onHours.results) {
        const key = `${date}:${hour}`;
        const item: DeviceDetail = { deviceId: device.id, name: device.name, zoneId: effective.zone_id, zone: effective.zone_name, categoryId: effective.category_id, category: effective.category_name, consumptionVersionId: effective.consumption_version_id, placementVersionId: effective.placement_version_id, energyMicros, energyKwh: microsToDecimal(energyMicros), formula };
        details.set(key, [...(details.get(key) ?? []), item]);
      }
    }
  }
  const allRows = slotsForRange(from, to).map(slot => {
    const key = `${slot.date}:${slot.hour}`;
    const fact = actual.get(key);
    const deviceDetails = details.get(key) ?? [];
    const devicesMicros = deviceDetails.reduce((sum, item) => sum + item.energyMicros, 0);
    const errorMessage = (calculationErrors.get(key) ?? []).join("; ");
    const deltaMicros = fact ? fact.micros - devicesMicros : null;
    const deltaPercent = fact && fact.micros !== 0 && deltaMicros !== null ? deltaMicros / fact.micros * 100 : null;
    const anomaly = deltaMicros !== null && Math.abs(deltaMicros) > absoluteToleranceMicros && (deltaPercent === null || Math.abs(deltaPercent) > percentTolerance);
    const status = errorMessage ? "CALCULATION_ERROR" : !fact ? "MISSING" : !anomaly ? "NORMAL" : deltaMicros! > 0 ? "UNALLOCATED" : "MODEL_HIGH";
    const tariff = tariffs.results.findLast(item => item.valid_from_date <= slot.date) ?? null;
    const actualCostMicros = fact && tariff ? costMicros(fact.micros, tariff.price_micros) : null;
    const devicesCostMicros = tariff ? costMicros(devicesMicros, tariff.price_micros) : null;
    const unallocatedMicros = deltaMicros === null ? null : Math.max(deltaMicros, 0);
    const unallocatedCostMicros = unallocatedMicros !== null && tariff ? costMicros(unallocatedMicros, tariff.price_micros) : null;
    return { ...slot, actualMicros: fact?.micros ?? null, actualKwh: fact ? microsToDecimal(fact.micros) : null, quality: fact?.quality ?? "MISSING", devicesMicros, devicesKwh: microsToDecimal(devicesMicros), deltaMicros, deltaKwh: deltaMicros === null ? null : microsToDecimal(deltaMicros), deltaPercent, status, errorMessage, details: deviceDetails,
      tariffId: tariff?.id ?? null, tariffPrice: tariff ? microsToDecimal(tariff.price_micros) : null,
      actualCostMicros, actualCost: actualCostMicros === null ? null : microsToDecimal(actualCostMicros),
      devicesCostMicros, devicesCost: devicesCostMicros === null ? null : microsToDecimal(devicesCostMicros),
      unallocatedCostMicros, unallocatedCost: unallocatedCostMicros === null ? null : microsToDecimal(unallocatedCostMicros) };
  });
  const rows = allRows.filter(row => row.actualMicros !== null || row.devicesMicros > 0 || row.status === "CALCULATION_ERROR");
  const totalActualMicros = rows.reduce((sum, row) => sum + (row.actualMicros ?? 0), 0);
  const totalDevicesMicros = rows.reduce((sum, row) => sum + row.devicesMicros, 0);
  const sumCost = (field: "actualCostMicros" | "devicesCostMicros" | "unallocatedCostMicros", relevant: (row: (typeof rows)[number]) => boolean) => {
    const selected = rows.filter(relevant);
    return selected.some(row => row[field] === null) ? null : selected.reduce((sum, row) => sum + (row[field] ?? 0), 0);
  };
  const totalActualCost = sumCost("actualCostMicros", row => row.actualMicros !== null);
  const totalDevicesCost = sumCost("devicesCostMicros", row => row.devicesMicros > 0);
  const totalUnallocatedCost = sumCost("unallocatedCostMicros", row => row.deltaMicros !== null && row.deltaMicros > 0);
  const aggregate = (field: "zone" | "category") => Array.from(rows.flatMap(row => row.details).reduce((map, item) => map.set(item[field], (map.get(item[field]) ?? 0) + item.energyMicros), new Map<string, number>())).map(([name, micros]) => ({ name, energyKwh: microsToDecimal(micros) }));
  return { from, to, settings: settingsDto(appSettings), allRows, rows, summary: { actualKwh: microsToDecimal(totalActualMicros), devicesKwh: microsToDecimal(totalDevicesMicros), deltaKwh: microsToDecimal(totalActualMicros - totalDevicesMicros), coveragePercent: rows.length ? Math.round(rows.filter(row => row.actualMicros !== null).length / rows.length * 100) : 0,
    actualCost: totalActualCost === null ? null : microsToDecimal(totalActualCost), devicesCost: totalDevicesCost === null ? null : microsToDecimal(totalDevicesCost), unallocatedCost: totalUnallocatedCost === null ? null : microsToDecimal(totalUnallocatedCost) }, byZone: aggregate("zone"), byCategory: aggregate("category"), errors: [...new Set(errors)] };
}

export async function persistCalculation(db: D1Database, calculation: Awaited<ReturnType<typeof buildCalculation>>, options: { audit?: boolean; comment?: string; source?: "ADMIN" | "SYSTEM" } = {}) {
  const now = new Date().toISOString();
  for (const row of calculation.allRows) {
    if (row.status === "CALCULATION_ERROR") continue;
    const statements = [db.prepare(`DELETE FROM device_hourly_energy WHERE date = ? AND hour = ?`).bind(row.date, row.hour)];
    for (const detail of row.details) statements.push(db.prepare(`INSERT INTO device_hourly_energy
      (device_id, date, hour, consumption_version_id, placement_version_id, zone_id, category_id, energy_micros, formula, calculated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(detail.deviceId, row.date, row.hour, detail.consumptionVersionId, detail.placementVersionId, detail.zoneId, detail.categoryId, detail.energyMicros, detail.formula, now));
    statements.push(db.prepare(`INSERT INTO hourly_reconciliation
      (meter_id, date, hour, actual_micros, actual_quality, devices_micros, delta_micros, status, error_message, calculated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(meter_id, date, hour) DO UPDATE SET actual_micros=excluded.actual_micros, actual_quality=excluded.actual_quality,
      devices_micros=excluded.devices_micros, delta_micros=excluded.delta_micros, status=excluded.status,
      error_message=excluded.error_message, calculated_at=excluded.calculated_at`)
      .bind(MAIN_METER_ID, row.date, row.hour, row.actualMicros, row.quality, row.devicesMicros, row.deltaMicros, row.status, row.errorMessage, now));
    await db.batch(statements);
  }
  if (options.audit !== false) {
    await db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at)
      VALUES (?, 'RECALCULATION', ?, 'RECALCULATE', ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), `${calculation.from}:${calculation.to}`, JSON.stringify({ rows: calculation.allRows.length, errors: calculation.errors }), options.comment ?? `Пересчёт ${calculation.from} — ${calculation.to}`, options.source ?? "ADMIN", now).run();
  }
}

export async function GET(request: Request) {
  try {
    const { from, to } = readRange(request);
    const db = getD1();
    await Promise.all([ensureReferenceData(db), ensureMainMeter(db)]);
    const { allRows: _allRows, ...result } = await buildCalculation(db, from, to);
    return Response.json(result);
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { from, to } = readRange(request);
    const db = getD1();
    await Promise.all([ensureReferenceData(db), ensureMainMeter(db)]);
    await assertRangeEditable(db, from, to);
    const calculation = await buildCalculation(db, from, to);
    await persistCalculation(db, calculation);
    const { allRows: _allRows, ...result } = calculation;
    return Response.json({ ...result, saved: true });
  } catch (error) { return errorResponse(error); }
}
