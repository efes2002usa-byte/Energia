import { MAIN_METER_ID, ManualRow, ReadingRow, ValidationError, errorResponse, getD1, hoursBetween, microsToDecimal, readingDto, slotDate, slotFromDate } from "@/lib/energy-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    const left = await db.prepare(`SELECT * FROM meter_readings WHERE id = ? AND meter_id = ?`).bind(id, MAIN_METER_ID).first<ReadingRow>();
    if (!left) throw new ValidationError("NOT_FOUND", "Показание не найдено", 404);
    const right = await db.prepare(`
      SELECT * FROM meter_readings
      WHERE meter_id = ? AND (reading_date > ? OR (reading_date = ? AND reading_hour > ?))
      ORDER BY reading_date ASC, reading_hour ASC LIMIT 1
    `).bind(MAIN_METER_ID, left.reading_date, left.reading_date, left.reading_hour).first<ReadingRow>();
    if (!right) throw new ValidationError("INTERVAL_NOT_CLOSED", "Для этого показания ещё нет следующей границы", 409);
    const intervalHours = hoursBetween(left, right);
    if (intervalHours < 1) throw new ValidationError("INVALID_INTERVAL", "Границы интервала расположены неверно");
    if (intervalHours > 744) throw new ValidationError("INTERVAL_TOO_LARGE", "Редактор поддерживает интервалы длиной до 31 дня");

    const manualResult = await db.prepare(`
      SELECT meter_id, date, hour, consumption_micros, comment, created_at, updated_at
      FROM manual_hourly_consumption
      WHERE meter_id = ? AND (date > ? OR (date = ? AND hour >= ?)) AND (date < ? OR (date = ? AND hour < ?))
      ORDER BY date ASC, hour ASC
    `).bind(MAIN_METER_ID, left.reading_date, left.reading_date, left.reading_hour, right.reading_date, right.reading_date, right.reading_hour).all<ManualRow>();
    const manualBySlot = new Map(manualResult.results.map(row => [`${row.date}:${row.hour}`, row]));
    const delta = right.value_micros - left.value_micros;
    const manualSum = manualResult.results.reduce((sum, row) => sum + row.consumption_micros, 0);
    if (manualSum > delta) throw new ValidationError("MANUAL_SUM_EXCEEDS_INTERVAL", "Сумма ручных часов превышает расход интервала");
    const automaticCount = intervalHours - manualResult.results.length;
    if (automaticCount === 0 && manualSum !== delta) throw new ValidationError("MANUAL_SUM_MISMATCH", "Сумма ручных часов не равна расходу интервала");
    const automaticBase = automaticCount > 0 ? Math.floor((delta - manualSum) / automaticCount) : 0;
    let remainder = automaticCount > 0 ? delta - manualSum - automaticBase * automaticCount : 0;
    const start = slotDate(left.reading_date, left.reading_hour);
    const hours = [];
    for (let index = 0; index < intervalHours; index += 1) {
      const slot = new Date(start.getTime() + index * 3_600_000);
      const { date, hour } = slotFromDate(slot);
      const manual = manualBySlot.get(`${date}:${hour}`);
      let finalMicros = manual?.consumption_micros ?? automaticBase;
      if (!manual && remainder > 0) {
        const laterAutomatic = Array.from({ length: intervalHours - index - 1 }, (_, offset) => {
          const later = new Date(start.getTime() + (index + offset + 1) * 3_600_000);
          const laterSlot = slotFromDate(later);
          return !manualBySlot.has(`${laterSlot.date}:${laterSlot.hour}`);
        }).some(Boolean);
        if (!laterAutomatic) {
          finalMicros += remainder;
          remainder = 0;
        }
      }
      hours.push({
        date,
        hour,
        automaticKwh: manual ? null : microsToDecimal(finalMicros),
        manualKwh: manual ? microsToDecimal(manual.consumption_micros) : null,
        finalKwh: microsToDecimal(finalMicros),
        quality: manual ? "MANUAL" : intervalHours === 1 ? "EXACT" : "INTERPOLATED",
        comment: manual?.comment ?? "",
      });
    }
    return Response.json({
      interval: {
        left: readingDto(left),
        right: readingDto(right),
        totalKwh: microsToDecimal(delta),
        hours,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
