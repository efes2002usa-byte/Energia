import { MAIN_METER_ID, ReadingRow, ValidationError, ensureMainMeter, errorResponse, getD1, hoursBetween, microsToDecimal, parseDecimalToMicros, readingDto, validateDate, validateHour } from "@/lib/energy-db";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { date?: string; hour?: number; valueKwh?: string };
    const date = validateDate(payload.date);
    const hour = validateHour(payload.hour);
    const valueMicros = parseDecimalToMicros(payload.valueKwh, "Показание");
    const db = getD1();
    await ensureMainMeter(db);
    const existing = await db.prepare(`SELECT id FROM meter_readings WHERE meter_id = ? AND reading_date = ? AND reading_hour = ?`).bind(MAIN_METER_ID, date, hour).first<{ id: string }>();
    if (existing) throw new ValidationError("READING_ALREADY_EXISTS", "Для этого часа уже существует показание", 409);
    const previous = await db.prepare(`SELECT * FROM meter_readings WHERE meter_id = ? AND (reading_date < ? OR (reading_date = ? AND reading_hour < ?)) ORDER BY reading_date DESC, reading_hour DESC LIMIT 1`).bind(MAIN_METER_ID, date, date, hour).first<ReadingRow>();
    const next = await db.prepare(`SELECT * FROM meter_readings WHERE meter_id = ? AND (reading_date > ? OR (reading_date = ? AND reading_hour > ?)) ORDER BY reading_date ASC, reading_hour ASC LIMIT 1`).bind(MAIN_METER_ID, date, date, hour).first<ReadingRow>();
    if (previous && valueMicros < previous.value_micros) throw new ValidationError("READING_BELOW_PREVIOUS", "Показание меньше предыдущего");
    if (next && valueMicros > next.value_micros) throw new ValidationError("READING_ABOVE_NEXT", "Показание больше следующего");
    const candidate = { reading_date: date, reading_hour: hour };
    const leftHours = previous ? hoursBetween(previous, candidate) : null;
    const rightHours = next ? hoursBetween(candidate, next) : null;
    return Response.json({
      previous: previous ? readingDto(previous) : null,
      next: next ? readingDto(next) : null,
      intervals: {
        before: previous ? { hours: leftHours, consumptionKwh: microsToDecimal(valueMicros - previous.value_micros) } : null,
        after: next ? { hours: rightHours, consumptionKwh: microsToDecimal(next.value_micros - valueMicros) } : null,
      },
      affected: {
        from: previous ? { date: previous.reading_date, hour: previous.reading_hour } : { date, hour },
        to: next ? { date: next.reading_date, hour: next.reading_hour } : { date, hour },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
