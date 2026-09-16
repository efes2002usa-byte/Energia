import { getD1, validateDate, ValidationError, weekdayForDate } from "@/lib/device-db";

export type CopyPair = { sourceDate: string; targetDate: string };
export type CopyPlanItem = { deviceId: string; sourceDate: string; targetDate: string; hours: number[]; targetHours: number[]; conflict: boolean };

export function addDays(date: string, days: number) {
  const value = new Date(`${validateDate(date)}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function validateDeviceIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationError("DEVICES_REQUIRED", "Выберите хотя бы один прибор");
  return [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
}

async function sourceHours(db: D1Database, deviceId: string, date: string) {
  const marker = await db.prepare(`SELECT source FROM device_schedule_days WHERE device_id = ? AND date = ?`).bind(deviceId, date).first<{ source: string }>();
  if (marker) {
    const slots = await db.prepare(`SELECT hour FROM device_on_hour WHERE device_id = ? AND date = ? ORDER BY hour`).bind(deviceId, date).all<{ hour: number }>();
    return slots.results.map(row => row.hour);
  }
  const weekday = weekdayForDate(date);
  const slots = await db.prepare(`SELECT hour FROM device_default_schedule WHERE device_id = ? AND weekday = ? ORDER BY hour`).bind(deviceId, weekday).all<{ hour: number }>();
  return slots.results.map(row => row.hour);
}

export async function buildCopyPlan(deviceIds: string[], pairs: CopyPair[]) {
  const db = getD1();
  const activeChecks = await Promise.all(deviceIds.flatMap(deviceId => pairs.flatMap(pair => [pair.sourceDate, pair.targetDate].map(date => db.prepare(`SELECT id FROM devices WHERE id = ? AND active_from_date <= ? AND (inactive_from_date IS NULL OR inactive_from_date > ?)`).bind(deviceId, date, date).first<{ id: string }>()))));
  if (activeChecks.some(value => !value)) throw new ValidationError("DEVICE_NOT_ACTIVE", "Один из приборов не активен во всём выбранном диапазоне", 409);
  const plan = await Promise.all(deviceIds.flatMap(deviceId => pairs.map(async pair => {
    const [hours, targetHours, marker] = await Promise.all([
      sourceHours(db, deviceId, pair.sourceDate),
      sourceHours(db, deviceId, pair.targetDate),
      db.prepare(`SELECT source FROM device_schedule_days WHERE device_id = ? AND date = ?`).bind(deviceId, pair.targetDate).first<{ source: string }>(),
    ]);
    return { deviceId, sourceDate: pair.sourceDate, targetDate: pair.targetDate, hours, targetHours, conflict: Boolean(marker) } satisfies CopyPlanItem;
  })));
  return { db, plan };
}

export function copySummary(plan: CopyPlanItem[]) {
  const conflicts = plan.filter(item => item.conflict).map(item => ({ deviceId: item.deviceId, date: item.targetDate }));
  return {
    deviceCount: new Set(plan.map(item => item.deviceId)).size,
    dayCount: new Set(plan.map(item => item.targetDate)).size,
    hourCount: plan.reduce((sum, item) => sum + new Set([...item.hours.filter(hour => !item.targetHours.includes(hour)), ...item.targetHours.filter(hour => !item.hours.includes(hour))]).size, 0),
    conflicts,
  };
}

export async function executeCopy(db: D1Database, plan: CopyPlanItem[], operation: "COPY_DAY" | "COPY_WEEK") {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const item of plan) {
    statements.push(
      db.prepare(`INSERT INTO device_schedule_days (device_id, date, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(device_id, date) DO UPDATE SET source = excluded.source, updated_at = excluded.updated_at`).bind(item.deviceId, item.targetDate, operation, now, now),
      db.prepare(`DELETE FROM device_on_hour WHERE device_id = ? AND date = ?`).bind(item.deviceId, item.targetDate),
    );
    if (item.hours.length > 0) {
      const values = item.hours.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const bindings = item.hours.flatMap(hour => [item.deviceId, item.targetDate, hour, operation, now, now]);
      statements.push(db.prepare(`INSERT INTO device_on_hour (device_id, date, hour, source, created_at, updated_at) VALUES ${values}`).bind(...bindings));
    }
  }
  statements.push(db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'DEVICE_SCHEDULE_COPY', ?, ?, ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), crypto.randomUUID(), operation, JSON.stringify(plan), operation === "COPY_DAY" ? "Копирование дня" : "Копирование недели", now));
  await db.batch(statements);
}
