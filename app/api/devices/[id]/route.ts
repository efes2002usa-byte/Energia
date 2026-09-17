import { cleanName, deviceDto, getD1, getDevice, microsToDecimal, ValidationError } from "@/lib/device-db";
import { assertExpectedUpdatedAt, errorResponse } from "@/lib/energy-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    const device = await getDevice(db, id);
    if (!device) throw new ValidationError("NOT_FOUND", "Прибор не найден", 404);
    const [consumptionVersions, placementVersions, schedule, audit] = await Promise.all([
      db.prepare(`SELECT * FROM device_consumption_versions WHERE device_id = ? ORDER BY valid_from_date DESC`).bind(id).all<Record<string, unknown>>(),
      db.prepare(`SELECT pv.*, z.name AS zone_name, c.name AS category_name FROM device_placement_versions pv JOIN zones z ON z.id = pv.zone_id JOIN device_categories c ON c.id = pv.category_id WHERE pv.device_id = ? ORDER BY pv.valid_from_date DESC`).bind(id).all<Record<string, unknown>>(),
      db.prepare(`SELECT weekday, hour FROM device_default_schedule WHERE device_id = ? ORDER BY weekday, hour`).bind(id).all<{ weekday: number; hour: number }>(),
      db.prepare(`SELECT action, before_data, after_data, comment, created_at FROM audit_log WHERE entity_id = ? OR entity_id LIKE ? ORDER BY created_at DESC LIMIT 50`).bind(id, `${id}:%`).all<Record<string, unknown>>(),
    ]);
    return Response.json({
      device: deviceDto(device),
      consumptionVersions: consumptionVersions.results.map(row => ({
        id: row.id, validFromDate: row.valid_from_date, mode: row.mode,
        consumptionPerHourKwh: row.consumption_per_hour_micros === null ? null : microsToDecimal(Number(row.consumption_per_hour_micros)),
        nominalPowerKw: row.nominal_power_micros === null ? null : microsToDecimal(Number(row.nominal_power_micros)),
        loadFactor: row.load_factor_ppm === null ? null : microsToDecimal(Number(row.load_factor_ppm)),
        quantity: row.quantity, comment: row.comment,
      })),
      placementVersions: placementVersions.results.map(row => ({ id: row.id, validFromDate: row.valid_from_date, zone: { id: row.zone_id, name: row.zone_name }, category: { id: row.category_id, name: row.category_name }, comment: row.comment })),
      defaultSchedule: Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, hours: schedule.results.filter(slot => slot.weekday === index + 1).map(slot => slot.hour) })),
      audit: audit.results,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json() as { name?: unknown; description?: unknown; expectedUpdatedAt?: unknown };
    const db = getD1();
    const existing = await db.prepare(`SELECT * FROM devices WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!existing) throw new ValidationError("NOT_FOUND", "Прибор не найден", 404);
    assertExpectedUpdatedAt(payload, existing.updated_at);
    const name = payload.name === undefined ? String(existing.name) : cleanName(payload.name, "Название прибора");
    const description = payload.description === undefined ? String(existing.description ?? "") : String(payload.description ?? "").trim();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE devices SET name = ?, description = ?, updated_at = ? WHERE id = ?`).bind(name, description, now, id),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, 'DEVICE', ?, 'UPDATE', ?, ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), id, JSON.stringify(existing), JSON.stringify({ name, description }), description, now),
    ]);
    return Response.json({ id, name, description });
  } catch (error) {
    return errorResponse(error);
  }
}
