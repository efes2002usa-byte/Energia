import { getD1, validateDate, ValidationError } from "@/lib/device-db";
import { assertExpectedUpdatedAt, errorResponse } from "@/lib/energy-db";
import { enqueueExistingRange, existingEditableEnd } from "@/lib/recalculation-jobs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json() as { inactiveFromDate?: unknown; comment?: unknown; expectedUpdatedAt?: unknown };
    const inactiveFromDate = validateDate(payload.inactiveFromDate);
    const comment = String(payload.comment ?? "").trim();
    if (!comment) throw new ValidationError("COMMENT_REQUIRED", "Укажите причину архивирования");
    const db = getD1();
    const existing = await db.prepare(`SELECT * FROM devices WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!existing) throw new ValidationError("NOT_FOUND", "Прибор не найден", 404);
    assertExpectedUpdatedAt(payload, existing.updated_at);
    if (inactiveFromDate <= String(existing.active_from_date)) throw new ValidationError("INVALID_INACTIVE_DATE", "Дата прекращения должна быть позже даты начала");
    const affectedToDate = await existingEditableEnd(db, inactiveFromDate);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE devices SET inactive_from_date = ?, is_archived = 1, updated_at = ? WHERE id = ?`).bind(inactiveFromDate, now, id),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, 'DEVICE', ?, 'ARCHIVE', ?, ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), id, JSON.stringify(existing), JSON.stringify({ inactiveFromDate, isArchived: true }), comment, now),
    ]);
    await enqueueExistingRange(db, inactiveFromDate, "ARCHIVE", comment, affectedToDate);
    return Response.json({ id, inactiveFromDate, isArchived: true, updatedAt: now });
  } catch (error) {
    return errorResponse(error);
  }
}
