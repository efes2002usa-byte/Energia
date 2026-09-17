import { dayWorkflow } from "@/lib/day-workflow";
import { getD1, validateDate, ValidationError } from "@/lib/energy-db";

async function completeSchedule(db: D1Database, date: string) {
  const devices = await db.prepare(`SELECT id FROM devices WHERE active_from_date <= ? AND (inactive_from_date IS NULL OR inactive_from_date > ?) ORDER BY id`).bind(date, date).all<{ id: string }>();
  const weekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() || 7));
  const now = new Date().toISOString();
  for (const { id } of devices.results) {
    const marker = await db.prepare(`SELECT 1 AS present FROM device_schedule_days WHERE device_id = ? AND date = ?`).bind(id, date).first<{ present: number }>();
    if (marker) continue;
    const defaults = await db.prepare(`SELECT hour FROM device_default_schedule WHERE device_id = ? AND weekday = ? ORDER BY hour`).bind(id, weekday).all<{ hour: number }>();
    const statements = [db.prepare(`INSERT INTO device_schedule_days (device_id, date, source, created_at, updated_at) VALUES (?, ?, 'DEFAULT', ?, ?)`).bind(id, date, now, now)];
    statements.push(...defaults.results.map(({ hour }) => db.prepare(`INSERT INTO device_on_hour (device_id, date, hour, source, created_at, updated_at) VALUES (?, ?, ?, 'DEFAULT', ?, ?)`).bind(id, date, hour, now, now)));
    await db.batch(statements);
  }
  await db.batch([
    db.prepare(`INSERT INTO day_workflows (date, status, schedule_completed_at, updated_at) VALUES (?, 'FILLED', ?, ?) ON CONFLICT(date) DO UPDATE SET status = 'FILLED', schedule_completed_at = excluded.schedule_completed_at, updated_at = excluded.updated_at`).bind(date, now, now),
    db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'DAY', ?, 'COMPLETE_SCHEDULE', ?, 'Расписание дня завершено', 'ADMIN', ?)`).bind(crypto.randomUUID(), date, JSON.stringify({ status: "FILLED", scheduleCompletedAt: now }), now),
  ]);
}

export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  try {
    const date = validateDate((await params).date);
    return Response.json({ day: await dayWorkflow(getD1(), date) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ date: string }> }) {
  try {
    const date = validateDate((await params).date);
    const payload = await request.json() as { action?: unknown; comment?: unknown; reason?: unknown };
    const action = String(payload.action ?? "");
    const db = getD1();
    const before = await dayWorkflow(db, date);
    const now = new Date().toISOString();

    if (action === "COMPLETE") {
      if (before.status === "CONFIRMED") throw new ValidationError("DAY_CONFIRMED", "Подтверждённый день нельзя завершить повторно", 409);
      await completeSchedule(db, date);
    } else if (action === "CONFIRM") {
      const comment = String(payload.comment ?? "").trim();
      if (!comment) throw new ValidationError("COMMENT_REQUIRED", "Для подтверждения обязателен комментарий");
      if (!before.readiness.readyToConfirm || before.status !== "RECONCILED") throw new ValidationError("DAY_NOT_READY", "Сначала завершите расписание, заполните факт за 24 часа и выполните расчёт без ошибок", 409);
      await db.batch([
        db.prepare(`UPDATE day_workflows SET status = 'CONFIRMED', confirmed_at = ?, confirmation_comment = ?, updated_at = ? WHERE date = ?`).bind(now, comment, now, date),
        db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, 'DAY', ?, 'CONFIRM', ?, ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), date, JSON.stringify(before), JSON.stringify({ status: "CONFIRMED", confirmedAt: now }), comment, now),
      ]);
    } else if (action === "UNLOCK") {
      const reason = String(payload.reason ?? "").trim();
      if (!reason) throw new ValidationError("REASON_REQUIRED", "Для разблокировки обязательна причина");
      if (before.status !== "CONFIRMED") throw new ValidationError("DAY_NOT_CONFIRMED", "День не подтверждён", 409);
      await db.batch([
        db.prepare(`UPDATE day_workflows SET status = 'RECONCILED', unlocked_at = ?, unlock_reason = ?, updated_at = ? WHERE date = ?`).bind(now, reason, now, date),
        db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, 'DAY', ?, 'UNLOCK', ?, ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), date, JSON.stringify(before), JSON.stringify({ status: "RECONCILED", unlockedAt: now }), reason, now),
      ]);
    } else {
      throw new ValidationError("INVALID_ACTION", "Неизвестное действие с днём");
    }

    return Response.json({ day: await dayWorkflow(db, date) });
  } catch (error) { return errorResponse(error); }
}

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  console.error(error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Неизвестная ошибка" } }, { status: 500 });
}
