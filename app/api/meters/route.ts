import { ensureMainMeter, errorResponse, getD1, MAIN_METER_ID } from "@/lib/energy-db";

export async function GET() {
  try {
    const db = getD1();
    await ensureMainMeter(db);
    const meters = await db.prepare(`
      SELECT m.id, m.name, m.serial_number, m.is_primary, m.is_active,
        (SELECT COUNT(*) FROM meter_readings r WHERE r.meter_id = m.id) AS reading_count
      FROM meters m ORDER BY m.is_primary DESC, m.name COLLATE NOCASE
    `).all<{ id: string; name: string; serial_number: string | null; is_primary: number; is_active: number; reading_count: number }>();
    return Response.json({ meters: meters.results.map(meter => ({ id: meter.id, name: meter.name, serialNumber: meter.serial_number, isPrimary: Boolean(meter.is_primary), isActive: Boolean(meter.is_active), readingCount: Number(meter.reading_count ?? 0) })), primaryMeterId: MAIN_METER_ID });
  } catch (error) {
    return errorResponse(error);
  }
}
