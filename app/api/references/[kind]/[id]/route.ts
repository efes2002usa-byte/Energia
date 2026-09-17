import { cleanName, getD1, normalizeName, ValidationError } from "@/lib/device-db";
import { assertExpectedUpdatedAt, errorResponse } from "@/lib/energy-db";

function resolveKind(kind: string) {
  if (kind === "zones") return { table: "zones", entityType: "ZONE" };
  if (kind === "categories") return { table: "device_categories", entityType: "DEVICE_CATEGORY" };
  throw new ValidationError("INVALID_REFERENCE_KIND", "Неизвестный тип справочника", 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await params;
    const { table, entityType } = resolveKind(kind);
    const payload = await request.json() as { name?: unknown; description?: unknown; sortOrder?: unknown; isActive?: unknown; expectedUpdatedAt?: unknown };
    const db = getD1();
    const existing = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!existing) throw new ValidationError("NOT_FOUND", "Запись справочника не найдена", 404);
    assertExpectedUpdatedAt(payload, existing.updated_at);
    const name = payload.name === undefined ? String(existing.name) : cleanName(payload.name);
    const normalizedName = normalizeName(name);
    const duplicate = await db.prepare(`SELECT id FROM ${table} WHERE normalized_name = ? AND id <> ?`).bind(normalizedName, id).first<{ id: string }>();
    if (duplicate) throw new ValidationError("REFERENCE_NAME_EXISTS", "Название уже используется", 409);
    const description = payload.description === undefined ? String(existing.description ?? "") : String(payload.description ?? "").trim();
    const sortOrder = payload.sortOrder === undefined ? Number(existing.sort_order) : Number(payload.sortOrder);
    if (!Number.isInteger(sortOrder)) throw new ValidationError("INVALID_SORT_ORDER", "Порядок сортировки должен быть целым числом");
    const isActive = payload.isActive === undefined ? Number(existing.is_active) : payload.isActive ? 1 : 0;
    if (table === "device_categories" && Number(existing.is_system) && !isActive) throw new ValidationError("SYSTEM_CATEGORY", "Системную категорию нельзя деактивировать", 409);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE ${table} SET name = ?, normalized_name = ?, description = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?`).bind(name, normalizedName, description, sortOrder, isActive, now, id),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, ?, ?, 'UPDATE', ?, ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), entityType, id, JSON.stringify(existing), JSON.stringify({ name, description, sortOrder, isActive: Boolean(isActive) }), description, now),
    ]);
    return Response.json({ id, name, description, sortOrder, isActive: Boolean(isActive), isSystem: Boolean(existing.is_system), updatedAt: now });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await params;
    const { table, entityType } = resolveKind(kind);
    const db = getD1();
    const existing = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!existing) throw new ValidationError("NOT_FOUND", "Запись справочника не найдена", 404);
    if (table === "device_categories" && Number(existing.is_system)) throw new ValidationError("SYSTEM_CATEGORY", "Системную категорию нельзя удалить", 409);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE ${table} SET is_active = 0, updated_at = ? WHERE id = ?`).bind(now, id),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, ?, ?, 'DEACTIVATE', ?, ?, 'Используемая запись сохранена в истории', 'ADMIN', ?)`).bind(crypto.randomUUID(), entityType, id, JSON.stringify(existing), JSON.stringify({ isActive: false }), now),
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
