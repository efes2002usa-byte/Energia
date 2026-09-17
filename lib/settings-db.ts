import { microsToDecimal } from "@/lib/energy-db";

export const SETTINGS_ID = "app";

export type SettingsRow = {
  id: string;
  facility_name: string;
  timezone: string;
  currency_code: string;
  percentage_tolerance_micros: number;
  absolute_tolerance_micros: number;
  closed_from_hour: number;
  closed_to_hour: number;
  updated_at: string;
};

export async function ensureAppSettings(db: D1Database) {
  await db.prepare(`INSERT OR IGNORE INTO app_settings
    (id, facility_name, timezone, currency_code, percentage_tolerance_micros, absolute_tolerance_micros, closed_from_hour, closed_to_hour)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(SETTINGS_ID, "Основной бар", "Europe/Moscow", "RUB", 5_000_000, 1_000_000, 3, 10).run();
}

export function settingsDto(row: SettingsRow) {
  return {
    facilityName: row.facility_name,
    timezone: row.timezone,
    currencyCode: row.currency_code,
    percentageTolerance: microsToDecimal(row.percentage_tolerance_micros),
    absoluteToleranceKwh: microsToDecimal(row.absolute_tolerance_micros),
    closedFromHour: row.closed_from_hour,
    closedToHour: row.closed_to_hour,
    updatedAt: row.updated_at,
  };
}

export async function getAppSettings(db: D1Database) {
  await ensureAppSettings(db);
  return (await db.prepare(`SELECT id, facility_name, timezone, currency_code, percentage_tolerance_micros,
    absolute_tolerance_micros, closed_from_hour, closed_to_hour, updated_at FROM app_settings WHERE id = ?`)
    .bind(SETTINGS_ID).first<SettingsRow>())!;
}
