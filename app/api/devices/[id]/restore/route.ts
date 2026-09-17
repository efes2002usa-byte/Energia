import { errorResponse, getD1 } from "@/lib/energy-db";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    const existing = await db.prepare("SELECT id, name, is_archived FROM devices WHERE id = ?").bind(id).first<{ id: string; name: string; is_archived: number }>();
    if (!existing) return Response.json({ error: { code: "ENTITY_NOT_FOUND", message: "Прибор не найден" } }, { status: 404 });
    if (!existing.is_archived) return Response.json({ data: { id, restored: false } });
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE devices SET is_archived = 0, inactive_from_date = NULL, updated_at = ? WHERE id = ?").bind(now, id),
      db.prepare("INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, 'DEVICE', ?, 'RESTORE', ?, ?, 'Восстановлен прибор', 'ADMIN', ?)").bind(crypto.randomUUID(), id, JSON.stringify({ isArchived: true }), JSON.stringify({ isArchived: false }), now),
    ]);
    return Response.json({ data: { id, restored: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
