import { MAIN_METER_ID, ReadingRow, ValidationError, ensureMainMeter, errorResponse, getD1, parseDecimalToMicros, readingDto, validateDate, validateHour, validateManualInterval } from "@/lib/energy-db";

export async function GET() {
  try {
    const db = getD1();
    await ensureMainMeter(db);
    const result = await db.prepare(`
      SELECT id, meter_id, reading_date, reading_hour, value_micros, comment, created_at, updated_at
      FROM meter_readings
      WHERE meter_id = ?
      ORDER BY reading_date DESC, reading_hour DESC
      LIMIT 500
    `).bind(MAIN_METER_ID).all<ReadingRow>();
    return Response.json({ readings: result.results.map(readingDto) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { date?: string; hour?: number; valueKwh?: string; comment?: string };
    const date = validateDate(payload.date);
    const hour = validateHour(payload.hour);
    const valueMicros = parseDecimalToMicros(payload.valueKwh, "Показание");
    const comment = String(payload.comment ?? "").trim();
    const db = getD1();
    await ensureMainMeter(db);

    const existing = await db.prepare(`
      SELECT id FROM meter_readings WHERE meter_id = ? AND reading_date = ? AND reading_hour = ?
    `).bind(MAIN_METER_ID, date, hour).first<{ id: string }>();
    if (existing) throw new ValidationError("READING_ALREADY_EXISTS", "Для этого часа уже существует показание", 409);

    const previous = await db.prepare(`
      SELECT * FROM meter_readings
      WHERE meter_id = ? AND (reading_date < ? OR (reading_date = ? AND reading_hour < ?))
      ORDER BY reading_date DESC, reading_hour DESC LIMIT 1
    `).bind(MAIN_METER_ID, date, date, hour).first<ReadingRow>();
    const next = await db.prepare(`
      SELECT * FROM meter_readings
      WHERE meter_id = ? AND (reading_date > ? OR (reading_date = ? AND reading_hour > ?))
      ORDER BY reading_date ASC, reading_hour ASC LIMIT 1
    `).bind(MAIN_METER_ID, date, date, hour).first<ReadingRow>();

    if (previous && valueMicros < previous.value_micros) {
      throw new ValidationError("READING_BELOW_PREVIOUS", "Показание меньше предыдущего");
    }
    if (next && valueMicros > next.value_micros) {
      throw new ValidationError("READING_ABOVE_NEXT", "Показание больше следующего");
    }

    const candidate = { reading_date: date, reading_hour: hour, value_micros: valueMicros };
    if (previous) await validateManualInterval(db, previous, candidate);
    if (next) await validateManualInterval(db, candidate, next);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`
        INSERT INTO meter_readings (id, meter_id, reading_date, reading_hour, value_micros, comment, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, MAIN_METER_ID, date, hour, valueMicros, comment, now, now),
      db.prepare(`
        INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at)
        VALUES (?, 'METER_READING', ?, 'CREATE', ?, ?, 'ADMIN', ?)
      `).bind(crypto.randomUUID(), id, JSON.stringify({ date, hour, valueKwh: payload.valueKwh }), comment, now),
    ]);

    const row = await db.prepare(`
      SELECT id, meter_id, reading_date, reading_hour, value_micros, comment, created_at, updated_at
      FROM meter_readings WHERE id = ?
    `).bind(id).first<ReadingRow>();
    return Response.json({ reading: readingDto(row!) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
