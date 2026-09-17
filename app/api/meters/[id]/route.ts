import { ensureMainMeter, errorResponse, getD1 } from "@/lib/energy-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    await ensureMainMeter(db);
    const meter = await db.prepare(`SELECT id, name, serial_number, is_primary, is_active, created_at FROM meters WHERE id = ?`).bind(id).first<{ id: string; name: string; serial_number: string | null; is_primary: number; is_active: number; created_at: string }>();
    if (!meter) return Response.json({ error: { code: "NOT_FOUND", message: "Счётчик не найден" } }, { status: 404 });
    const count = await db.prepare(`SELECT COUNT(*) AS count FROM meter_readings WHERE meter_id = ?`).bind(id).first<{ count: number }>();
    return Response.json({ meter: { id: meter.id, name: meter.name, serialNumber: meter.serial_number, isPrimary: Boolean(meter.is_primary), isActive: Boolean(meter.is_active), createdAt: meter.created_at, readingCount: Number(count?.count ?? 0) } });
  } catch (error) {
    return errorResponse(error);
  }
}
