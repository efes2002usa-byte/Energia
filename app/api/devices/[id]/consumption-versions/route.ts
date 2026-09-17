import { getD1, parseConsumption, validateDate, ValidationError } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";
import { enqueueExistingRange, existingEditableEnd } from "@/lib/recalculation-jobs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json() as Record<string, unknown>;
    const validFromDate = validateDate(payload.validFromDate);
    const comment = String(payload.comment ?? "").trim();
    if (!comment) throw new ValidationError("COMMENT_REQUIRED", "Для новой версии обязателен комментарий");
    const consumption = parseConsumption(payload);
    const db = getD1();
    const device = await db.prepare(`SELECT active_from_date FROM devices WHERE id = ?`).bind(id).first<{ active_from_date: string }>();
    if (!device) throw new ValidationError("NOT_FOUND", "Прибор не найден", 404);
    if (validFromDate < device.active_from_date) throw new ValidationError("INVALID_VERSION_DATE", "Версия не может начинаться раньше прибора");
    const duplicate = await db.prepare(`SELECT id FROM device_consumption_versions WHERE device_id = ? AND valid_from_date = ?`).bind(id, validFromDate).first<{ id: string }>();
    if (duplicate) throw new ValidationError("VERSION_DATE_EXISTS", "Версия потребления на эту дату уже существует", 409);
    const affectedToDate = await existingEditableEnd(db, validFromDate);
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO device_consumption_versions (id, device_id, valid_from_date, mode, consumption_per_hour_micros, nominal_power_micros, load_factor_ppm, quantity, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(versionId, id, validFromDate, consumption.mode, consumption.consumptionPerHourMicros, consumption.nominalPowerMicros, consumption.loadFactorPpm, consumption.quantity, comment, now),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'DEVICE_CONSUMPTION_VERSION', ?, 'CREATE', ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), `${id}:${versionId}`, JSON.stringify({ validFromDate, ...consumption }), comment, now),
    ]);
    await enqueueExistingRange(db, validFromDate, "DEVICE", comment, affectedToDate);
    return Response.json({ id: versionId, affectedRange: { from: validFromDate, to: affectedToDate } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
