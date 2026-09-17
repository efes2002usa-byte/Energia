import { getD1, validateDate, validateHours, ValidationError, weekdayForDate } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";
import { assertDayEditable } from "@/lib/day-workflow";
import { enqueueRecalculation } from "@/lib/recalculation-jobs";

export async function GET(_request: Request, { params }: { params: Promise<{ deviceId: string; date: string }> }) {
  try {
    const { deviceId, date: rawDate } = await params;
    const date = validateDate(rawDate);
    const weekday = weekdayForDate(date);
    const db = getD1();
    const device = await db.prepare(`SELECT id FROM devices WHERE id = ? AND active_from_date <= ? AND (inactive_from_date IS NULL OR inactive_from_date > ?)`).bind(deviceId, date, date).first<{ id: string }>();
    if (!device) throw new ValidationError("DEVICE_NOT_ACTIVE", "Прибор не активен в выбранную дату", 409);
    const marker = await db.prepare(`SELECT source FROM device_schedule_days WHERE device_id = ? AND date = ?`).bind(deviceId, date).first<{ source: string }>();
    const slots = marker
      ? await db.prepare(`SELECT hour FROM device_on_hour WHERE device_id = ? AND date = ? ORDER BY hour`).bind(deviceId, date).all<{ hour: number }>()
      : await db.prepare(`SELECT hour FROM device_default_schedule WHERE device_id = ? AND weekday = ? ORDER BY hour`).bind(deviceId, weekday).all<{ hour: number }>();
    return Response.json({ deviceId, date, hours: slots.results.map(row => row.hour), source: marker?.source ?? "DEFAULT_PREVIEW", isMaterialized: Boolean(marker) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ deviceId: string; date: string }> }) {
  try {
    const { deviceId, date: rawDate } = await params;
    const date = validateDate(rawDate);
    const payload = await request.json() as { hours?: unknown; source?: unknown };
    let hours = validateHours(payload.hours);
    const source = payload.source === "DEFAULT" ? "DEFAULT" : "MANUAL";
    const db = getD1();
    await assertDayEditable(db, date);
    const device = await db.prepare(`SELECT id FROM devices WHERE id = ? AND active_from_date <= ? AND (inactive_from_date IS NULL OR inactive_from_date > ?)`).bind(deviceId, date, date).first<{ id: string }>();
    if (!device) throw new ValidationError("DEVICE_NOT_ACTIVE", "Прибор не активен в выбранную дату", 409);
    if (source === "DEFAULT") {
      const weekday = weekdayForDate(date);
      const defaults = await db.prepare(`SELECT hour FROM device_default_schedule WHERE device_id = ? AND weekday = ? ORDER BY hour`).bind(deviceId, weekday).all<{ hour: number }>();
      hours = defaults.results.map(row => row.hour);
    }
    const before = await db.prepare(`SELECT hour FROM device_on_hour WHERE device_id = ? AND date = ? ORDER BY hour`).bind(deviceId, date).all<{ hour: number }>();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO device_schedule_days (device_id, date, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(device_id, date) DO UPDATE SET source = excluded.source, updated_at = excluded.updated_at`).bind(deviceId, date, source, now, now),
      db.prepare(`DELETE FROM device_on_hour WHERE device_id = ? AND date = ?`).bind(deviceId, date),
      ...hours.map(hour => db.prepare(`INSERT INTO device_on_hour (device_id, date, hour, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(deviceId, date, hour, source, now, now)),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, 'DEVICE_SCHEDULE_DAY', ?, 'REPLACE', ?, ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), `${deviceId}:${date}`, JSON.stringify(before.results.map(row => row.hour)), JSON.stringify(hours), source === "DEFAULT" ? "Применён недельный шаблон" : "Ручное расписание дня", now),
    ]);
    const beforeHours = before.results.map(row => row.hour);
    const changed = [...new Set([...beforeHours.filter(hour => !hours.includes(hour)), ...hours.filter(hour => !beforeHours.includes(hour))])].sort((a, b) => a - b);
    if (changed.length) await enqueueRecalculation(db, { from: { date, hour: changed[0] }, to: { date, hour: changed.at(-1)! }, reason: "CALENDAR", comment: `Изменено расписание прибора ${deviceId}` });
    return Response.json({ deviceId, date, hours, source, isMaterialized: true });
  } catch (error) {
    return errorResponse(error);
  }
}
