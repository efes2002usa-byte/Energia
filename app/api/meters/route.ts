import { cleanName } from "@/lib/device-db";
import { ensureMainMeter, errorResponse, getD1, MAIN_METER_ID, ValidationError } from "@/lib/energy-db";
import { logApiDuration } from "@/lib/metrics";

export async function GET() {
  const startedAt = performance.now();
  try {
    const db = getD1();
    await ensureMainMeter(db);
    const meters = await db.prepare(`
      SELECT m.id, m.name, m.serial_number, m.is_primary, m.is_active,
        (SELECT COUNT(*) FROM meter_readings r WHERE r.meter_id = m.id) AS reading_count
      FROM meters m ORDER BY m.is_primary DESC, m.name COLLATE NOCASE
    `).all<{ id: string; name: string; serial_number: string | null; is_primary: number; is_active: number; reading_count: number }>();
    const response = Response.json({ meters: meters.results.map(meter => ({ id: meter.id, name: meter.name, serialNumber: meter.serial_number, isPrimary: Boolean(meter.is_primary), isActive: Boolean(meter.is_active), readingCount: Number(meter.reading_count ?? 0) })), primaryMeterId: MAIN_METER_ID });
    logApiDuration("meters", startedAt);
    return response;
  } catch (error) {
    logApiDuration("meters", startedAt, 500);
    return errorResponse(error);
  }
}

/** Register a physical replacement without deleting the old meter history. */
export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const payload = await request.json() as { name?: unknown; serialNumber?: unknown; replacePrimary?: unknown };
    const name = cleanName(payload.name, "Название счётчика");
    const serialNumber = String(payload.serialNumber ?? "").trim() || null;
    const replacePrimary = payload.replacePrimary !== false;
    const db = getD1();
    await ensureMainMeter(db);
    const duplicate = serialNumber ? await db.prepare("SELECT id FROM meters WHERE serial_number = ?").bind(serialNumber).first<{ id: string }>() : null;
    if (duplicate) throw new ValidationError("METER_SERIAL_EXISTS", "Счётчик с таким серийным номером уже зарегистрирован", 409);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements = [];
    if (replacePrimary) statements.push(db.prepare("UPDATE meters SET is_primary = 0, is_active = 0 WHERE is_primary = 1").bind());
    statements.push(
      db.prepare("INSERT INTO meters (id, name, serial_number, is_primary, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)").bind(id, name, serialNumber, replacePrimary ? 1 : 0, now),
      db.prepare("INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'METER', ?, 'CREATE', ?, ?, 'ADMIN', ?)").bind(crypto.randomUUID(), id, JSON.stringify({ name, serialNumber, replacePrimary }), "Зарегистрирован физический счётчик", now),
    );
    await db.batch(statements);
    const response = Response.json({ data: { id, name, serialNumber, isPrimary: replacePrimary, isActive: true } }, { status: 201 });
    logApiDuration("meters", startedAt, 201);
    return response;
  } catch (error) {
    logApiDuration("meters", startedAt, 500);
    return errorResponse(error);
  }
}
