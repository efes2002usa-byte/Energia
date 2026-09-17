import { env } from "cloudflare:workers";
import {
  hoursBetween,
  MICROS_PER_KWH,
  microsToDecimal,
  parseDecimalToMicros,
  slotDate,
  slotFromDate,
  validateDate,
  validateHour,
  ValidationError,
} from "@/lib/energy-math";

export {
  hoursBetween,
  MICROS_PER_KWH,
  microsToDecimal,
  parseDecimalToMicros,
  slotDate,
  slotFromDate,
  validateDate,
  validateHour,
  ValidationError,
} from "@/lib/energy-math";

export const MAIN_METER_ID = "main";

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

export function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" } }, { status: 500 });
}
