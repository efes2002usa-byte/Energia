import { MAIN_METER_ID, errorResponse, getD1, readingDto, ValidationError } from "@/lib/energy-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    const current = await db.prepare(`SELECT * FROM meter_readings WHERE id = ? AND meter_id = ?`).bind(id, MAIN_METER_ID).first<Record<string, unknown> & { reading_date: string; reading_hour: number; value_micros: number }>();
    if (!current) throw new ValidationError("NOT_FOUND", "Показание не найдено", 404);
    const [previous, next] = await Promise.all([
      db.prepare(`SELECT * FROM meter_readings WHERE meter_id = ? AND (reading_date < ? OR (reading_date = ? AND reading_hour < ?)) ORDER BY reading_date DESC, reading_hour DESC LIMIT 1`).bind(MAIN_METER_ID, current.reading_date, current.reading_date, current.reading_hour).first<any>(),
      db.prepare(`SELECT * FROM meter_readings WHERE meter_id = ? AND (reading_date > ? OR (reading_date = ? AND reading_hour > ?)) ORDER BY reading_date ASC, reading_hour ASC LIMIT 1`).bind(MAIN_METER_ID, current.reading_date, current.reading_date, current.reading_hour).first<any>(),
    ]);
    return Response.json({ reading: readingDto(current as any), previous: previous ? readingDto(previous) : null, next: next ? readingDto(next) : null, affectedRange: previous && next ? { from: previous.reading_date, to: next.reading_date } : null });
  } catch (error) {
    return errorResponse(error);
  }
}
