import { assertExpectedUpdatedAt, MAIN_METER_ID, ReadingRow, ValidationError, errorResponse, getD1, parseDecimalToMicros, readingDto, validateManualInterval } from "@/lib/energy-db";
import { assertRangeEditable } from "@/lib/day-workflow";
import { enqueueRecalculation, previousSlot } from "@/lib/recalculation-jobs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json() as { valueKwh?: string; comment?: string; expectedUpdatedAt?: unknown };
    const db = getD1();
    const current = await db.prepare(`SELECT * FROM meter_readings WHERE id = ? AND meter_id = ?`).bind(id, MAIN_METER_ID).first<ReadingRow>();
    if (!current) throw new ValidationError("NOT_FOUND", "Показание не найдено", 404);
    assertExpectedUpdatedAt(payload, current.updated_at);
    const valueMicros = payload.valueKwh === undefined ? current.value_micros : parseDecimalToMicros(payload.valueKwh, "Показание");
    const comment = payload.comment === undefined ? current.comment : String(payload.comment).trim();
    const previous = await db.prepare(`
      SELECT * FROM meter_readings WHERE meter_id = ? AND (reading_date < ? OR (reading_date = ? AND reading_hour < ?))
      ORDER BY reading_date DESC, reading_hour DESC LIMIT 1
    `).bind(MAIN_METER_ID, current.reading_date, current.reading_date, current.reading_hour).first<ReadingRow>();
    const next = await db.prepare(`
      SELECT * FROM meter_readings WHERE meter_id = ? AND (reading_date > ? OR (reading_date = ? AND reading_hour > ?))
      ORDER BY reading_date ASC, reading_hour ASC LIMIT 1
    `).bind(MAIN_METER_ID, current.reading_date, current.reading_date, current.reading_hour).first<ReadingRow>();
    await assertRangeEditable(db, previous?.reading_date ?? current.reading_date, next?.reading_date ?? current.reading_date);
    if (previous && valueMicros < previous.value_micros) throw new ValidationError("READING_BELOW_PREVIOUS", "Показание меньше предыдущего");
    if (next && valueMicros > next.value_micros) throw new ValidationError("READING_ABOVE_NEXT", "Показание больше следующего");
    const candidate = { ...current, value_micros: valueMicros };
    if (previous) await validateManualInterval(db, previous, candidate);
    if (next) await validateManualInterval(db, candidate, next);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE meter_readings SET value_micros = ?, comment = ?, updated_at = ? WHERE id = ?`).bind(valueMicros, comment, now, id),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at) VALUES (?, 'METER_READING', ?, 'UPDATE', ?, ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), id, JSON.stringify(readingDto(current)), JSON.stringify({ valueKwh: payload.valueKwh, comment }), comment, now),
    ]);
    if (previous || next) await enqueueRecalculation(db, {
      from: previous ? { date: previous.reading_date, hour: previous.reading_hour } : { date: current.reading_date, hour: current.reading_hour },
      to: previousSlot(next ? { date: next.reading_date, hour: next.reading_hour } : { date: current.reading_date, hour: current.reading_hour }),
      reason: "METER_READING", comment: comment || "Изменено показание",
    });
    const updated = await db.prepare(`SELECT * FROM meter_readings WHERE id = ?`).bind(id).first<ReadingRow>();
    return Response.json({ reading: readingDto(updated!) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    const current = await db.prepare(`SELECT * FROM meter_readings WHERE id = ? AND meter_id = ?`).bind(id, MAIN_METER_ID).first<ReadingRow>();
    if (!current) throw new ValidationError("NOT_FOUND", "Показание не найдено", 404);
    const previous = await db.prepare(`SELECT reading_date, reading_hour FROM meter_readings WHERE meter_id = ? AND (reading_date < ? OR (reading_date = ? AND reading_hour < ?)) ORDER BY reading_date DESC, reading_hour DESC LIMIT 1`).bind(MAIN_METER_ID, current.reading_date, current.reading_date, current.reading_hour).first<Pick<ReadingRow, "reading_date" | "reading_hour">>();
    const next = await db.prepare(`SELECT reading_date, reading_hour FROM meter_readings WHERE meter_id = ? AND (reading_date > ? OR (reading_date = ? AND reading_hour > ?)) ORDER BY reading_date ASC, reading_hour ASC LIMIT 1`).bind(MAIN_METER_ID, current.reading_date, current.reading_date, current.reading_hour).first<Pick<ReadingRow, "reading_date" | "reading_hour">>();
    await assertRangeEditable(db, previous?.reading_date ?? current.reading_date, next?.reading_date ?? current.reading_date);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`DELETE FROM meter_readings WHERE id = ?`).bind(id),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, comment, source, created_at) VALUES (?, 'METER_READING', ?, 'DELETE', ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), id, JSON.stringify(readingDto(current)), current.comment, now),
    ]);
    if (previous || next) await enqueueRecalculation(db, {
      from: previous ? { date: previous.reading_date, hour: previous.reading_hour } : { date: current.reading_date, hour: current.reading_hour },
      to: previousSlot(next ? { date: next.reading_date, hour: next.reading_hour } : { date: current.reading_date, hour: current.reading_hour }),
      reason: "METER_READING", comment: current.comment || "Удалено показание",
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
