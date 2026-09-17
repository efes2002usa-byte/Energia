import { errorResponse, getD1, ValidationError } from "@/lib/energy-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const row = await getD1().prepare(`SELECT * FROM audit_log WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!row) throw new ValidationError("AUDIT_NOT_FOUND", "Запись аудита не найдена", 404);
    const parse = (value: unknown) => { if (!value) return null; try { return JSON.parse(String(value)); } catch { return value; } };
    return Response.json({ entry: { id: row.id, entityType: row.entity_type, entityId: row.entity_id, action: row.action, before: parse(row.before_data), after: parse(row.after_data), comment: row.comment, source: row.source, createdAt: row.created_at } });
  } catch (error) { return errorResponse(error); }
}
