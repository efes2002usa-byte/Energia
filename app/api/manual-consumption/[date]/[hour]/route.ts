import { MAIN_METER_ID, ManualRow, ReadingRow, ValidationError, errorResponse, getD1, hoursBetween, microsToDecimal, parseDecimalToMicros, validateDate, validateHour } from "@/lib/energy-db";

async function intervalBounds(db: D1Database, date: string, hour: number) {
  const left = await db.prepare(`
    SELECT * FROM meter_readings
    WHERE meter_id = ? AND (reading_date < ? OR (reading_date = ? AND reading_hour <= ?))
    ORDER BY reading_date DESC, reading_hour DESC LIMIT 1
  `).bind(MAIN_METER_ID, date, date, hour).first<ReadingRow>();
  const right = await db.prepare(`
    SELECT * FROM meter_readings
    WHERE meter_id = ? AND (reading_date > ? OR (reading_date = ? AND reading_hour > ?))
    ORDER BY reading_date ASC, reading_hour ASC LIMIT 1
  `).bind(MAIN_METER_ID, date, date, hour).first<ReadingRow>();
  if (!left || !right) throw new ValidationError("INTERVAL_NOT_CLOSED", "Для часа нужны предыдущее и следующее показания", 409);
  return { left, right };
}

export async function PUT(request: Request, { params }: { params: Promise<{ date: string; hour: string }> }) {
  try {
    const route = await params;
    const date = validateDate(route.date);
    const hour = validateHour(route.hour);
    const payload = await request.json() as { consumptionKwh?: string; comment?: string };
    const consumptionMicros = parseDecimalToMicros(payload.consumptionKwh, "Ручной расход");
    const comment = String(payload.comment ?? "").trim();
    if (!comment) throw new ValidationError("COMMENT_REQUIRED", "Для ручного значения обязателен комментарий");
    const db = getD1();
    const { left, right } = await intervalBounds(db, date, hour);
    const intervalHours = hoursBetween(left, right);
    const delta = right.value_micros - left.value_micros;
    const existing = await db.prepare(`
      SELECT * FROM manual_hourly_consumption WHERE meter_id = ? AND date = ? AND hour = ?
    `).bind(MAIN_METER_ID, date, hour).first<ManualRow>();
    const others = await db.prepare(`
      SELECT consumption_micros FROM manual_hourly_consumption
      WHERE meter_id = ? AND NOT (date = ? AND hour = ?)
        AND (date > ? OR (date = ? AND hour >= ?))
        AND (date < ? OR (date = ? AND hour < ?))
    `).bind(MAIN_METER_ID, date, hour, left.reading_date, left.reading_date, left.reading_hour, right.reading_date, right.reading_date, right.reading_hour).all<{ consumption_micros: number }>();
    const manualSum = others.results.reduce((sum, row) => sum + row.consumption_micros, 0) + consumptionMicros;
    if (manualSum > delta) throw new ValidationError("MANUAL_SUM_EXCEEDS_INTERVAL", "Сумма ручных часов превышает расход интервала");
    const manualCount = others.results.length + 1;
    if (manualCount === intervalHours && manualSum !== delta) {
      throw new ValidationError("MANUAL_SUM_MISMATCH", "Если все часы заданы вручную, их сумма должна равняться расходу интервала");
    }
    const now = new Date().toISOString();
    const entityId = `${MAIN_METER_ID}:${date}:${hour}`;
    await db.batch([
      db.prepare(`
        INSERT INTO manual_hourly_consumption (meter_id, date, hour, consumption_micros, comment, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(meter_id, date, hour) DO UPDATE SET
          consumption_micros = excluded.consumption_micros,
          comment = excluded.comment,
          updated_at = excluded.updated_at
      `).bind(MAIN_METER_ID, date, hour, consumptionMicros, comment, existing?.created_at ?? now, now),
      db.prepare(`
        INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at)
        VALUES (?, 'MANUAL_CONSUMPTION', ?, ?, ?, ?, ?, 'ADMIN', ?)
      `).bind(crypto.randomUUID(), entityId, existing ? "UPDATE" : "CREATE", existing ? JSON.stringify({ consumptionKwh: microsToDecimal(existing.consumption_micros), comment: existing.comment }) : null, JSON.stringify({ consumptionKwh: microsToDecimal(consumptionMicros), comment }), comment, now),
    ]);
    return Response.json({ manualConsumption: { meterId: MAIN_METER_ID, date, hour, consumptionKwh: microsToDecimal(consumptionMicros), comment } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ date: string; hour: string }> }) {
  try {
    const route = await params;
    const date = validateDate(route.date);
    const hour = validateHour(route.hour);
    const db = getD1();
    const existing = await db.prepare(`SELECT * FROM manual_hourly_consumption WHERE meter_id = ? AND date = ? AND hour = ?`).bind(MAIN_METER_ID, date, hour).first<ManualRow>();
    if (!existing) throw new ValidationError("NOT_FOUND", "Ручное значение не найдено", 404);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`DELETE FROM manual_hourly_consumption WHERE meter_id = ? AND date = ? AND hour = ?`).bind(MAIN_METER_ID, date, hour),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, comment, source, created_at) VALUES (?, 'MANUAL_CONSUMPTION', ?, 'DELETE', ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), `${MAIN_METER_ID}:${date}:${hour}`, JSON.stringify({ consumptionKwh: microsToDecimal(existing.consumption_micros), comment: existing.comment }), existing.comment, now),
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
