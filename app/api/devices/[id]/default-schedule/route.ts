import { getD1, validateHours, ValidationError } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    const device = await db.prepare(`SELECT id FROM devices WHERE id = ?`).bind(id).first<{ id: string }>();
    if (!device) throw new ValidationError("NOT_FOUND", "Прибор не найден", 404);
    const result = await db.prepare(`SELECT weekday, hour FROM device_default_schedule WHERE device_id = ? ORDER BY weekday, hour`).bind(id).all<{ weekday: number; hour: number }>();
    return Response.json({ schedule: Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, hours: result.results.filter(row => row.weekday === index + 1).map(row => row.hour) })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json() as { schedule?: Array<{ weekday?: unknown; hours?: unknown }> };
    if (!Array.isArray(payload.schedule)) throw new ValidationError("INVALID_SCHEDULE", "Передайте недельное расписание");
    const schedule = payload.schedule.map(day => {
      const weekday = Number(day.weekday);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new ValidationError("INVALID_WEEKDAY", "День недели должен быть от 1 до 7");
      return { weekday, hours: validateHours(day.hours) };
    });
    const db = getD1();
    const device = await db.prepare(`SELECT id FROM devices WHERE id = ?`).bind(id).first<{ id: string }>();
    if (!device) throw new ValidationError("NOT_FOUND", "Прибор не найден", 404);
    const before = await db.prepare(`SELECT weekday, hour FROM device_default_schedule WHERE device_id = ? ORDER BY weekday, hour`).bind(id).all<{ weekday: number; hour: number }>();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`DELETE FROM device_default_schedule WHERE device_id = ?`).bind(id),
      ...schedule.flatMap(day => day.hours.map(hour => db.prepare(`INSERT INTO device_default_schedule (device_id, weekday, hour) VALUES (?, ?, ?)`).bind(id, day.weekday, hour))),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, 'DEVICE_DEFAULT_SCHEDULE', ?, 'REPLACE', ?, ?, 'Недельный шаблон', 'ADMIN', ?)`).bind(crypto.randomUUID(), id, JSON.stringify(before.results), JSON.stringify(schedule), now),
    ]);
    return Response.json({ schedule });
  } catch (error) {
    return errorResponse(error);
  }
}
