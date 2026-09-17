import { buildCalculation, dateRange, persistCalculation } from "@/app/api/reconciliation/route";
import { assertRangeEditable } from "@/lib/day-workflow";
import { ensureReferenceData } from "@/lib/device-db";
import { ensureMainMeter, slotDate, slotFromDate, validateDate, validateHour, ValidationError } from "@/lib/energy-db";

export type RecalculationReason = "CALENDAR" | "DEVICE" | "PLACEMENT" | "ARCHIVE" | "METER_READING" | "MANUAL_CONSUMPTION" | "TARIFF" | "MANUAL" | "MERGED";
export type RecalculationSlot = { date: string; hour: number };

export type RecalculationJobRow = {
  id: string; from_date: string; from_hour: number; to_date: string; to_hour: number;
  reason: RecalculationReason; comment: string; status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  total_hours: number; processed_hours: number; error_message: string;
  created_at: string; started_at: string | null; completed_at: string | null; updated_at: string;
};

function slotTime(slot: RecalculationSlot) { return slotDate(slot.date, slot.hour).getTime(); }

export function normalizeRange(from: RecalculationSlot, to: RecalculationSlot) {
  const left = { date: validateDate(from.date), hour: validateHour(from.hour) };
  const right = { date: validateDate(to.date), hour: validateHour(to.hour) };
  if (slotTime(left) > slotTime(right)) throw new ValidationError("INVALID_RANGE", "Начало диапазона должно быть раньше конца");
  const totalHours = Math.round((slotTime(right) - slotTime(left)) / 3_600_000) + 1;
  if (totalHours > 24 * 366) throw new ValidationError("RANGE_TOO_LARGE", "Диапазон пересчёта не должен превышать 366 дней");
  return { from: left, to: right, totalHours };
}

export function previousSlot(slot: RecalculationSlot) {
  return slotFromDate(new Date(slotTime(slot) - 3_600_000));
}

export function jobDto(row: RecalculationJobRow) {
  return {
    id: row.id,
    from: { date: row.from_date, hour: row.from_hour },
    to: { date: row.to_date, hour: row.to_hour },
    reason: row.reason,
    comment: row.comment,
    status: row.status,
    totalHours: row.total_hours,
    processedHours: row.processed_hours,
    progressPercent: row.total_hours ? Math.round(row.processed_hours / row.total_hours * 100) : 0,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

async function getJob(db: D1Database, id: string) {
  return db.prepare(`SELECT * FROM recalculation_jobs WHERE id = ?`).bind(id).first<RecalculationJobRow>();
}

function overlaps(row: RecalculationJobRow, from: RecalculationSlot, to: RecalculationSlot) {
  return slotTime({ date: row.from_date, hour: row.from_hour }) <= slotTime(to)
    && slotTime({ date: row.to_date, hour: row.to_hour }) >= slotTime(from);
}

export async function enqueueRecalculation(db: D1Database, input: { from: RecalculationSlot; to: RecalculationSlot; reason: RecalculationReason; comment?: string; process?: boolean }) {
  const range = normalizeRange(input.from, input.to);
  await assertRangeEditable(db, range.from.date, range.to.date);
  const pending = await db.prepare(`SELECT * FROM recalculation_jobs WHERE status = 'PENDING' ORDER BY created_at`).all<RecalculationJobRow>();
  const existing = pending.results.find(row => overlaps(row, range.from, range.to));
  let id: string;
  if (existing) {
    const mergedFrom = slotTime(range.from) < slotTime({ date: existing.from_date, hour: existing.from_hour }) ? range.from : { date: existing.from_date, hour: existing.from_hour };
    const mergedTo = slotTime(range.to) > slotTime({ date: existing.to_date, hour: existing.to_hour }) ? range.to : { date: existing.to_date, hour: existing.to_hour };
    const merged = normalizeRange(mergedFrom, mergedTo);
    const comment = [existing.comment, input.comment].filter(Boolean).join("; ").slice(0, 1000);
    const now = new Date().toISOString();
    await db.prepare(`UPDATE recalculation_jobs SET from_date = ?, from_hour = ?, to_date = ?, to_hour = ?, reason = 'MERGED', comment = ?, total_hours = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'`)
      .bind(merged.from.date, merged.from.hour, merged.to.date, merged.to.hour, comment, merged.totalHours, now, existing.id).run();
    id = existing.id;
  } else {
    id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO recalculation_jobs (id, from_date, from_hour, to_date, to_hour, reason, comment, status, total_hours, processed_hours, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, ?, ?)`)
      .bind(id, range.from.date, range.from.hour, range.to.date, range.to.hour, input.reason, String(input.comment ?? "").trim(), range.totalHours, now, now).run();
  }
  if (input.process !== false) await processRecalculationQueue(db);
  const row = await getJob(db, id);
  if (!row) throw new Error("Созданное задание пересчёта не найдено");
  return row;
}

async function runJob(db: D1Database, job: RecalculationJobRow) {
  const startedAt = new Date().toISOString();
  const claim = await db.prepare(`UPDATE recalculation_jobs SET status = 'RUNNING', started_at = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'`).bind(startedAt, startedAt, job.id).run();
  if (!claim.meta.changes) return;
  const errors: string[] = [];
  let processed = 0;
  try {
    await Promise.all([ensureReferenceData(db), ensureMainMeter(db)]);
    for (const date of dateRange(job.from_date, job.to_date)) {
      const calculation = await buildCalculation(db, date, date);
      const fromHour = date === job.from_date ? job.from_hour : 0;
      const toHour = date === job.to_date ? job.to_hour : 23;
      const selected = calculation.allRows.filter(row => row.hour >= fromHour && row.hour <= toHour);
      errors.push(...selected.map(row => row.errorMessage).filter(Boolean));
      await persistCalculation(db, { ...calculation, allRows: selected }, { audit: false });
      processed += selected.length;
      const now = new Date().toISOString();
      await db.prepare(`UPDATE recalculation_jobs SET processed_hours = ?, updated_at = ? WHERE id = ?`).bind(processed, now, job.id).run();
    }
    const completedAt = new Date().toISOString();
    const uniqueErrors = [...new Set(errors)];
    const status = uniqueErrors.length ? "FAILED" : "COMPLETED";
    const errorMessage = uniqueErrors.join("; ").slice(0, 4000);
    await db.batch([
      db.prepare(`UPDATE recalculation_jobs SET status = ?, processed_hours = ?, error_message = ?, completed_at = ?, updated_at = ? WHERE id = ?`).bind(status, processed, errorMessage, completedAt, completedAt, job.id),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'RECALCULATION_JOB', ?, 'RECALCULATE', ?, ?, ?, ?)`).bind(crypto.randomUUID(), job.id, JSON.stringify({ from: { date: job.from_date, hour: job.from_hour }, to: { date: job.to_date, hour: job.to_hour }, status, processedHours: processed, errors: uniqueErrors }), job.comment || `Пересчёт: ${job.reason}`, job.reason === "MANUAL" ? "ADMIN" : "SYSTEM", completedAt),
    ]);
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Неизвестная ошибка пересчёта";
    await db.prepare(`UPDATE recalculation_jobs SET status = 'FAILED', processed_hours = ?, error_message = ?, completed_at = ?, updated_at = ? WHERE id = ?`).bind(processed, message.slice(0, 4000), completedAt, completedAt, job.id).run();
  }
}

export async function processRecalculationQueue(db: D1Database) {
  const running = await db.prepare(`SELECT id FROM recalculation_jobs WHERE status = 'RUNNING' LIMIT 1`).first<{ id: string }>();
  if (running) return;
  for (let index = 0; index < 10; index += 1) {
    const next = await db.prepare(`SELECT * FROM recalculation_jobs WHERE status = 'PENDING' ORDER BY created_at LIMIT 1`).first<RecalculationJobRow>();
    if (!next) break;
    await runJob(db, next);
  }
}

export async function lastCalculatedDate(db: D1Database, fromDate: string) {
  const row = await db.prepare(`SELECT MAX(date) AS date FROM hourly_reconciliation WHERE date >= ?`).bind(fromDate).first<{ date: string | null }>();
  return row?.date ?? null;
}

export async function existingEditableEnd(db: D1Database, fromDate: string) {
  const toDate = await lastCalculatedDate(db, fromDate);
  if (toDate) await assertRangeEditable(db, fromDate, toDate);
  return toDate;
}

export async function enqueueExistingRange(db: D1Database, fromDate: string, reason: RecalculationReason, comment: string, preparedToDate?: string | null) {
  const toDate = preparedToDate === undefined ? await existingEditableEnd(db, fromDate) : preparedToDate;
  if (!toDate) return null;
  return enqueueRecalculation(db, { from: { date: fromDate, hour: 0 }, to: { date: toDate, hour: 23 }, reason, comment });
}
