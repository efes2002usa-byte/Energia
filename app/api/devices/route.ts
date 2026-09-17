import { cleanName, deviceDto, DeviceRow, ensureReferenceData, getD1, parseConsumption, validateDate, validateHours, ValidationError } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";
import { enqueueExistingRange, existingEditableEnd } from "@/lib/recalculation-jobs";

export async function GET() {
  try {
    const db = getD1();
    await ensureReferenceData(db);
    const result = await db.prepare(`
      SELECT d.*,
        pv.zone_id, z.name AS zone_name, pv.category_id, c.name AS category_name, pv.valid_from_date AS placement_valid_from,
        cv.valid_from_date AS consumption_valid_from, cv.mode, cv.consumption_per_hour_micros,
        cv.nominal_power_micros, cv.load_factor_ppm, cv.quantity, cv.comment AS consumption_comment
      FROM devices d
      JOIN device_placement_versions pv ON pv.id = (
        SELECT id FROM device_placement_versions WHERE device_id = d.id ORDER BY valid_from_date DESC LIMIT 1
      )
      JOIN zones z ON z.id = pv.zone_id
      JOIN device_categories c ON c.id = pv.category_id
      JOIN device_consumption_versions cv ON cv.id = (
        SELECT id FROM device_consumption_versions WHERE device_id = d.id ORDER BY valid_from_date DESC LIMIT 1
      )
      ORDER BY d.is_archived ASC, d.name COLLATE NOCASE ASC
    `).all<DeviceRow>();
    return Response.json({ devices: result.results.map(deviceDto) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const name = cleanName(payload.name, "Название прибора");
    const description = String(payload.description ?? "").trim();
    const activeFromDate = validateDate(payload.activeFromDate);
    const zoneId = String(payload.zoneId ?? "");
    const categoryId = String(payload.categoryId ?? "");
    if (!zoneId || !categoryId) throw new ValidationError("PLACEMENT_REQUIRED", "Выберите зону и категорию");
    const consumption = parseConsumption(payload);
    const schedulePayload = Array.isArray(payload.defaultSchedule) ? payload.defaultSchedule as Array<{ weekday?: unknown; hours?: unknown }> : [];
    const schedule = schedulePayload.map(day => {
      const weekday = Number(day.weekday);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new ValidationError("INVALID_WEEKDAY", "День недели должен быть от 1 до 7");
      return { weekday, hours: validateHours(day.hours) };
    });
    const db = getD1();
    await ensureReferenceData(db);
    const affectedToDate = await existingEditableEnd(db, activeFromDate);
    const [zone, category] = await Promise.all([
      db.prepare(`SELECT id FROM zones WHERE id = ? AND is_active = 1`).bind(zoneId).first<{ id: string }>(),
      db.prepare(`SELECT id FROM device_categories WHERE id = ? AND is_active = 1`).bind(categoryId).first<{ id: string }>(),
    ]);
    if (!zone || !category) throw new ValidationError("REFERENCE_INACTIVE", "Зона или категория недоступна", 409);
    const deviceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements = [
      db.prepare(`INSERT INTO devices (id, name, description, active_from_date, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`).bind(deviceId, name, description, activeFromDate, now, now),
      db.prepare(`INSERT INTO device_placement_versions (id, device_id, valid_from_date, zone_id, category_id, comment, created_at) VALUES (?, ?, ?, ?, ?, 'Первичное размещение', ?)`).bind(crypto.randomUUID(), deviceId, activeFromDate, zoneId, categoryId, now),
      db.prepare(`INSERT INTO device_consumption_versions (id, device_id, valid_from_date, mode, consumption_per_hour_micros, nominal_power_micros, load_factor_ppm, quantity, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Первичная версия', ?)`).bind(crypto.randomUUID(), deviceId, activeFromDate, consumption.mode, consumption.consumptionPerHourMicros, consumption.nominalPowerMicros, consumption.loadFactorPpm, consumption.quantity, now),
      ...schedule.flatMap(day => day.hours.map(hour => db.prepare(`INSERT INTO device_default_schedule (device_id, weekday, hour) VALUES (?, ?, ?)`).bind(deviceId, day.weekday, hour))),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'DEVICE', ?, 'CREATE', ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), deviceId, JSON.stringify({ name, description, activeFromDate, zoneId, categoryId, consumption, schedule }), description, now),
    ];
    await db.batch(statements);
    await enqueueExistingRange(db, activeFromDate, "DEVICE", description || "Создан прибор", affectedToDate);
    return Response.json({ id: deviceId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
