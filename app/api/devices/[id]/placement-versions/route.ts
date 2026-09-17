import { getD1, validateDate, ValidationError } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";
import { enqueueExistingRange, existingEditableEnd } from "@/lib/recalculation-jobs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    const rows = await db.prepare(`SELECT pv.id, pv.valid_from_date, pv.zone_id, z.name AS zone_name, pv.category_id, c.name AS category_name, pv.comment, pv.created_at FROM device_placement_versions pv JOIN zones z ON z.id = pv.zone_id JOIN device_categories c ON c.id = pv.category_id WHERE pv.device_id = ? ORDER BY pv.valid_from_date DESC`).bind(id).all<any>();
    return Response.json({ versions: rows.results.map(row => ({ id: row.id, validFromDate: row.valid_from_date, zone: { id: row.zone_id, name: row.zone_name }, category: { id: row.category_id, name: row.category_name }, comment: row.comment, createdAt: row.created_at })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json() as { validFromDate?: unknown; zoneId?: unknown; categoryId?: unknown; comment?: unknown };
    const validFromDate = validateDate(payload.validFromDate);
    const zoneId = String(payload.zoneId ?? "");
    const categoryId = String(payload.categoryId ?? "");
    const comment = String(payload.comment ?? "").trim();
    if (!zoneId || !categoryId) throw new ValidationError("PLACEMENT_REQUIRED", "Выберите зону и категорию");
    const db = getD1();
    const [device, zone, category, duplicate] = await Promise.all([
      db.prepare(`SELECT active_from_date FROM devices WHERE id = ?`).bind(id).first<{ active_from_date: string }>(),
      db.prepare(`SELECT id FROM zones WHERE id = ? AND is_active = 1`).bind(zoneId).first<{ id: string }>(),
      db.prepare(`SELECT id FROM device_categories WHERE id = ? AND is_active = 1`).bind(categoryId).first<{ id: string }>(),
      db.prepare(`SELECT id FROM device_placement_versions WHERE device_id = ? AND valid_from_date = ?`).bind(id, validFromDate).first<{ id: string }>(),
    ]);
    if (!device) throw new ValidationError("NOT_FOUND", "Прибор не найден", 404);
    if (!zone || !category) throw new ValidationError("REFERENCE_INACTIVE", "Зона или категория недоступна", 409);
    if (validFromDate < device.active_from_date) throw new ValidationError("INVALID_VERSION_DATE", "Версия не может начинаться раньше прибора");
    if (duplicate) throw new ValidationError("VERSION_DATE_EXISTS", "Версия размещения на эту дату уже существует", 409);
    const affectedToDate = await existingEditableEnd(db, validFromDate);
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO device_placement_versions (id, device_id, valid_from_date, zone_id, category_id, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(versionId, id, validFromDate, zoneId, categoryId, comment, now),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'DEVICE_PLACEMENT_VERSION', ?, 'CREATE', ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), `${id}:${versionId}`, JSON.stringify({ validFromDate, zoneId, categoryId }), comment, now),
    ]);
    await enqueueExistingRange(db, validFromDate, "PLACEMENT", comment || "Изменено размещение прибора", affectedToDate);
    return Response.json({ id: versionId, affectedRange: { from: validFromDate, to: affectedToDate } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
