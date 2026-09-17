export const MICROS_PER_KWH = 1_000_000;

export class ValidationError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function assertExpectedUpdatedAt(payload: Record<string, unknown>, actualUpdatedAt: unknown) {
  if (payload.expectedUpdatedAt === undefined) return;
  if (String(payload.expectedUpdatedAt) !== String(actualUpdatedAt ?? "")) {
    throw new ValidationError("CONCURRENT_UPDATE", "Запись уже изменилась. Обновите данные и повторите операцию", 409);
  }
}

export function parseDecimalToMicros(value: unknown, field = "Значение"): number {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) {
    throw new ValidationError("VALIDATION_ERROR", `${field} должно быть неотрицательным числом с точностью до 6 знаков`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * MICROS_PER_KWH + Number(fraction.padEnd(6, "0"));
  if (!Number.isSafeInteger(result)) throw new ValidationError("VALIDATION_ERROR", `${field} слишком велико`);
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
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new ValidationError("VALIDATION_ERROR", "Час должен быть целым числом от 0 до 23");
  return hour;
}

export function slotDate(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
}

export function slotFromDate(value: Date): { date: string; hour: number } {
  return { date: value.toISOString().slice(0, 10), hour: value.getUTCHours() };
}

export function hoursBetween(left: { reading_date: string; reading_hour: number }, right: { reading_date: string; reading_hour: number }): number {
  return Math.round((slotDate(right.reading_date, right.reading_hour).getTime() - slotDate(left.reading_date, left.reading_hour).getTime()) / 3_600_000);
}

/** Distribute an interval total while preserving explicit manual hourly values. */
export function distributeMicros(totalMicros: number, hourCount: number, manualByIndex: Map<number, number>): number[] | null {
  if (!Number.isSafeInteger(totalMicros) || totalMicros < 0 || !Number.isInteger(hourCount) || hourCount < 1) return null;
  const manualSum = [...manualByIndex.values()].reduce((sum, value) => sum + value, 0);
  const automatic = hourCount - manualByIndex.size;
  if (manualSum > totalMicros || automatic < 0 || (automatic === 0 && manualSum !== totalMicros)) return null;
  const base = automatic ? Math.floor((totalMicros - manualSum) / automatic) : 0;
  let remainder = automatic ? totalMicros - manualSum - base * automatic : 0;
  return Array.from({ length: hourCount }, (_, index) => {
    if (manualByIndex.has(index)) return manualByIndex.get(index)!;
    if (remainder > 0) { remainder -= 1; return base + 1; }
    return base;
  });
}

export function selectEffectiveTariff<T extends { valid_from_date: string }>(tariffs: T[], date: string): T | null {
  return tariffs.reduce<T | null>((selected, tariff) => tariff.valid_from_date <= date && (!selected || tariff.valid_from_date > selected.valid_from_date) ? tariff : selected, null);
}

export function isReconciliationAnomaly(deltaMicros: number | null, actualMicros: number | null, absoluteToleranceMicros: number, percentageTolerance: number): boolean {
  if (deltaMicros === null) return false;
  const deltaPercent = actualMicros !== null && actualMicros !== 0 ? deltaMicros / actualMicros * 100 : null;
  return Math.abs(deltaMicros) > absoluteToleranceMicros && (deltaPercent === null || Math.abs(deltaPercent) > percentageTolerance);
}
