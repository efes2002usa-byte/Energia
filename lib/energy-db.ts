import { env } from "cloudflare:workers";

export const MAIN_METER_ID = "main";
export const MICROS_PER_KWH = 1_000_000;

export type ReadingRow = {
  id: string;
  meter_id: string;
  reading_date: string;
  reading_hour: number;
  value_micros: number;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type ManualRow = {
  meter_id: string;
  date: string;
  hour: number;
  consumption_micros: number;
  comment: string;
  created_at: string;
  updated_at: string;
};

export function getD1(): D1Database {
  if (!env.DB) throw new Error("База данных временно недоступна");
  return env.DB;
}

export async function ensureMainMeter(db: D1Database) {
  await db.prepare(`
    INSERT OR IGNORE INTO meters (id, name, is_primary, is_active)
    VALUES (?, ?, 1, 1)
  `).bind(MAIN_METER_ID, "Бар №1").run();
}

export function parseDecimalToMicros(value: unknown, field = "Значение"): number {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) {
    throw new ValidationError("VALIDATION_ERROR", `${field} должно быть неотрицательным числом с точностью до 6 знаков`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * MICROS_PER_KWH + Number(fraction.padEnd(6, "0"));
  if (!Number.isSafeInteger(result)) {
    throw new ValidationError("VALIDATION_ERROR", `${field} слишком велико`);
  }
  return result;
}

export function microsToDecimal(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / MICROS_PER_KWH)}.${String(absolute % MICROS_PER_KWH).padStart(6, "0")}`;
}

export function validateDate(value: unknown): string {
  const date = String(value ?? "");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ValidationError("VALIDATION_ERROR", "Укажите корректную дату");
  }
  return date;
}

export function validateHour(value: unknown): number {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new ValidationError("VALIDATION_ERROR", "Час должен быть целым числом от 0 до 23");
  }
  return hour;
}

export function slotDate(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
}

export function slotFromDate(value: Date): { date: string; hour: number } {
  return { date: value.toISOString().slice(0, 10), hour: value.getUTCHours() };
}

export function hoursBetween(left: Pick<ReadingRow, "reading_date" | "reading_hour">, right: Pick<ReadingRow, "reading_date" | "reading_hour">): number {
  return Math.round((slotDate(right.reading_date, right.reading_hour).getTime() - slotDate(left.reading_date, left.reading_hour).getTime()) / 3_600_000);
}

export function readingDto(row: ReadingRow) {
  return {
    id: row.id,
    meterId: row.meter_id,
    date: row.reading_date,
    hour: row.reading_hour,
    valueKwh: microsToDecimal(row.value_micros),
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function validateManualInterval(db: D1Database, left: Pick<ReadingRow, "reading_date" | "reading_hour" | "value_micros">, right: Pick<ReadingRow, "reading_date" | "reading_hour" | "value_micros">) {
  const intervalHours = hoursBetween(left, right);
  if (intervalHours < 1) throw new ValidationError("INVALID_INTERVAL", "Границы интервала расположены неверно");
  const aggregate = await db.prepare(`
    SELECT COUNT(*) AS manual_count, COALESCE(SUM(consumption_micros), 0) AS manual_sum
    FROM manual_hourly_consumption
    WHERE meter_id = ?
      AND (date > ? OR (date = ? AND hour >= ?))
      AND (date < ? OR (date = ? AND hour < ?))
  `).bind(MAIN_METER_ID, left.reading_date, left.reading_date, left.reading_hour, right.reading_date, right.reading_date, right.reading_hour).first<{ manual_count: number; manual_sum: number }>();
  const manualCount = Number(aggregate?.manual_count ?? 0);
  const manualSum = Number(aggregate?.manual_sum ?? 0);
  const delta = right.value_micros - left.value_micros;
  if (manualSum > delta) throw new ValidationError("MANUAL_SUM_EXCEEDS_INTERVAL", "После изменения показания сумма ручных часов превысит расход интервала");
  if (manualCount === intervalHours && manualSum !== delta) throw new ValidationError("MANUAL_SUM_MISMATCH", "После изменения показания сумма полностью ручного интервала не совпадёт с расходом");
}

export class ValidationError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  console.error(error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
}
