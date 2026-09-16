import { errorResponse, getD1, MAIN_METER_ID, microsToDecimal, slotDate, slotFromDate, validateDate, ValidationError } from "@/lib/energy-db";
import { consumptionKwh, ensureReferenceData, weekdayForDate } from "@/lib/device-db";

type Reading = { reading_date: string; reading_hour: number; value_micros: number };
type Manual = { date: string; hour: number; consumption_micros: number; comment: string };
type Device = {
  id: string; name: string; zone_name: string; category_name: string;
  active_from_date: string; inactive_from_date: string | null;
  mode: "HOURLY_AVERAGE" | "POWER_FACTOR";
  consumption_per_hour_micros: number | null; nominal_power_micros: number | null;
  load_factor_ppm: number | null; quantity: number;
  placement_valid_from: string | null; consumption_valid_from: string | null;
};

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function hoursInRange(from: string, to: string) {
  const result: Array<{ date: string; hour: number }> = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (let hour = 0; hour < 24; hour += 1) result.push({ date, hour });
  }
  return result;
}

function expectedMicros(device: Device) {
  return consumptionKwh(device);
}

async function calculateInterval(db: D1Database, left: Reading, right: Reading) {
  const start = slotDate(left.reading_date, left.reading_hour);
  const intervalHours = Math.round((slotDate(right.reading_date, right.reading_hour).getTime() - start.getTime()) / 3_600_000);
  if (intervalHours < 1 || intervalHours > 744) return [];
  const manuals = await db.prepare(`
    SELECT date, hour, consumption_micros, comment FROM manual_hourly_consumption
    WHERE meter_id = ? AND (date > ? OR (date = ? AND hour >= ?))
      AND (date < ? OR (date = ? AND hour < ?)) ORDER BY date, hour
  `).bind(MAIN_METER_ID, left.reading_date, left.reading_date, left.reading_hour, right.reading_date, right.reading_date, right.reading_hour).all<Manual>();
  const manualBySlot = new Map(manuals.results.map(row => [`${row.date}:${row.hour}`, row]));
  const delta = right.value_micros - left.value_micros;
  const manualSum = manuals.results.reduce((sum, row) => sum + row.consumption_micros, 0);
  const automatic = intervalHours - manuals.results.length;
  if (delta < 0 || manualSum > delta || automatic < 0) return [];
  const base = automatic > 0 ? Math.floor((delta - manualSum) / automatic) : 0;
  let remainder = automatic > 0 ? delta - manualSum - base * automatic : 0;
  const result: Array<{ date: string; hour: number; actualMicros: number; quality: string; comment: string }> = [];
  for (let index = 0; index < intervalHours; index += 1) {
    const slot = new Date(start.getTime() + index * 3_600_000);
    const key = slotFromDate(slot);
    const manual = manualBySlot.get(`${key.date}:${key.hour}`);
    let actualMicros = manual?.consumption_micros ?? base;
    if (!manual && remainder > 0) {
      let hasLaterAutomatic = false;
      for (let offset = index + 1; offset < intervalHours; offset += 1) {
        const later = slotFromDate(new Date(start.getTime() + offset * 3_600_000));
        if (!manualBySlot.has(`${later.date}:${later.hour}`)) { hasLaterAutomatic = true; break; }
      }
      if (!hasLaterAutomatic) { actualMicros += remainder; remainder = 0; }
    }
    result.push({ date: key.date, hour: key.hour, actualMicros, quality: manual ? "MANUAL" : intervalHours === 1 ? "EXACT" : "INTERPOLATED", comment: manual?.comment ?? "" });
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const to = validateDate(url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10));
    const from = validateDate(url.searchParams.get("from") ?? to);
    const span = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
    if (span < 0 || span > 31) throw new ValidationError("INVALID_RANGE", "Период должен быть от 1 до 31 дня");
    const db = getD1();
    await ensureReferenceData(db);
    const readings = await db.prepare(`SELECT reading_date, reading_hour, value_micros FROM meter_readings WHERE meter_id = ? ORDER BY reading_date, reading_hour`).bind(MAIN_METER_ID).all<Reading>();
    const actual = new Map<string, { micros: number; quality: string; comment: string }>();
    for (let index = 0; index < readings.results.length - 1; index += 1) {
      const interval = await calculateInterval(db, readings.results[index], readings.results[index + 1]);
      for (const item of interval) if (item.date >= from && item.date <= to) actual.set(`${item.date}:${item.hour}`, { micros: item.actualMicros, quality: item.quality, comment: item.comment });
    }

    const deviceRows = await db.prepare(`
      SELECT d.id, d.name, d.active_from_date, d.inactive_from_date,
        pv.valid_from_date AS placement_valid_from, z.name AS zone_name, c.name AS category_name,
        cv.valid_from_date AS consumption_valid_from, cv.mode, cv.consumption_per_hour_micros,
        cv.nominal_power_micros, cv.load_factor_ppm, cv.quantity
      FROM devices d
      LEFT JOIN device_placement_versions pv ON pv.id = (
        SELECT id FROM device_placement_versions WHERE device_id = d.id AND valid_from_date <= ? ORDER BY valid_from_date DESC LIMIT 1
      )
      LEFT JOIN zones z ON z.id = pv.zone_id
      LEFT JOIN device_categories c ON c.id = pv.category_id
      LEFT JOIN device_consumption_versions cv ON cv.id = (
        SELECT id FROM device_consumption_versions WHERE device_id = d.id AND valid_from_date <= ? ORDER BY valid_from_date DESC LIMIT 1
      )
      WHERE d.is_archived = 0 AND d.active_from_date <= ? AND (d.inactive_from_date IS NULL OR d.inactive_from_date >= ?)
      ORDER BY d.name COLLATE NOCASE
    `).bind(to, to, to, from).all<Device>();
    const errors: string[] = [];
    const expected = new Map<string, number>();
    const byDevice = new Map<string, { name: string; zone: string; category: string; totalMicros: number }>();
    for (const device of deviceRows.results) {
      if (!device.placement_valid_from || !device.consumption_valid_from) { errors.push(`${device.name}: отсутствует обязательная версия размещения или потребления`); continue; }
      const total = { name: device.name, zone: device.zone_name, category: device.category_name, totalMicros: 0 };
      for (const slot of hoursInRange(from, to)) {
        if (slot.date < device.active_from_date || (device.inactive_from_date && slot.date >= device.inactive_from_date)) continue;
        const marker = await db.prepare(`SELECT 1 AS present FROM device_schedule_days WHERE device_id = ? AND date = ?`).bind(device.id, slot.date).first<{ present: number }>();
        const on = marker
          ? await db.prepare(`SELECT 1 AS present FROM device_on_hour WHERE device_id = ? AND date = ? AND hour = ?`).bind(device.id, slot.date, slot.hour).first<{ present: number }>()
          : await db.prepare(`SELECT 1 AS present FROM device_default_schedule WHERE device_id = ? AND weekday = ? AND hour = ?`).bind(device.id, weekdayForDate(slot.date), slot.hour).first<{ present: number }>();
        if (!on) continue;
        const micros = expectedMicros(device);
        expected.set(`${slot.date}:${slot.hour}`, (expected.get(`${slot.date}:${slot.hour}`) ?? 0) + micros);
        total.totalMicros += micros;
      }
      byDevice.set(device.id, total);
    }

    const rows = hoursInRange(from, to).map(slot => {
      const key = `${slot.date}:${slot.hour}`;
      const fact = actual.get(key);
      const devices = expected.get(key) ?? 0;
      const delta = fact ? fact.micros - devices : null;
      return { date: slot.date, hour: slot.hour, actualKwh: fact ? microsToDecimal(fact.micros) : null, quality: fact?.quality ?? "MISSING", devicesKwh: microsToDecimal(devices), deltaKwh: delta === null ? null : microsToDecimal(delta), status: !fact ? "Нет факта" : Math.abs(delta ?? 0) <= 100_000 ? "Норма" : delta! > 0 ? "Нераспределено" : "Модель завышена" };
    }).filter(row => row.actualKwh !== null || row.devicesKwh !== "0.000000");
    const totalActual = rows.reduce((sum, row) => sum + (row.actualKwh ? Number(row.actualKwh) : 0), 0);
    const totalDevices = rows.reduce((sum, row) => sum + Number(row.devicesKwh), 0);
    return Response.json({ from, to, summary: { actualKwh: totalActual.toFixed(6), devicesKwh: totalDevices.toFixed(6), deltaKwh: (totalActual - totalDevices).toFixed(6), coveragePercent: totalActual ? Math.round(rows.filter(row => row.actualKwh !== null).length / rows.length * 100) : 0 }, rows, devices: Array.from(byDevice.values()), errors });
  } catch (error) { return errorResponse(error); }
}
