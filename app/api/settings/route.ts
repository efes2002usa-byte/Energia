import { assertExpectedUpdatedAt, errorResponse, getD1, parseDecimalToMicros, ValidationError } from "@/lib/energy-db";
import { getAppSettings, SETTINGS_ID, settingsDto } from "@/lib/settings-db";

function validateTimezone(value: unknown) {
  const timezone = String(value ?? "").trim();
  try { new Intl.DateTimeFormat("ru-RU", { timeZone: timezone }).format(new Date()); }
  catch { throw new ValidationError("INVALID_TIMEZONE", "Укажите корректный часовой пояс IANA, например Europe/Moscow"); }
  return timezone;
}

function validateHour(value: unknown, label: string) {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new ValidationError("INVALID_CLOSED_HOUR", `${label} должен быть целым часом от 0 до 23`);
  return hour;
}

export async function GET() {
  try {
    const db = getD1();
    return Response.json({ settings: settingsDto(await getAppSettings(db)) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const facilityName = String(payload.facilityName ?? "").trim();
    if (!facilityName || facilityName.length > 120) throw new ValidationError("INVALID_FACILITY_NAME", "Название объекта должно содержать от 1 до 120 символов");
    const timezone = validateTimezone(payload.timezone);
    const currencyCode = String(payload.currencyCode ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) throw new ValidationError("INVALID_CURRENCY", "Валюта должна быть трёхбуквенным кодом, например RUB");
    const percentageToleranceMicros = parseDecimalToMicros(payload.percentageTolerance, "Процентный допуск");
    if (percentageToleranceMicros > 100_000_000) throw new ValidationError("INVALID_PERCENTAGE_TOLERANCE", "Процентный допуск должен быть от 0 до 100");
    const absoluteToleranceMicros = parseDecimalToMicros(payload.absoluteToleranceKwh, "Абсолютный допуск");
    const closedFromHour = validateHour(payload.closedFromHour, "Начало закрытия");
    const closedToHour = validateHour(payload.closedToHour, "Конец закрытия");
    if (closedFromHour === closedToHour) throw new ValidationError("INVALID_CLOSED_RANGE", "Начало и конец закрытия не должны совпадать");

    const db = getD1();
    const beforeRow = await getAppSettings(db);
    assertExpectedUpdatedAt(payload, beforeRow.updated_at);
    const before = settingsDto(beforeRow);
    const now = new Date().toISOString();
    const after = { facilityName, timezone, currencyCode, percentageTolerance: String(payload.percentageTolerance), absoluteToleranceKwh: String(payload.absoluteToleranceKwh), closedFromHour, closedToHour };
    await db.batch([
      db.prepare(`UPDATE app_settings SET facility_name = ?, timezone = ?, currency_code = ?, percentage_tolerance_micros = ?,
        absolute_tolerance_micros = ?, closed_from_hour = ?, closed_to_hour = ?, updated_at = ? WHERE id = ?`)
        .bind(facilityName, timezone, currencyCode, percentageToleranceMicros, absoluteToleranceMicros, closedFromHour, closedToHour, now, SETTINGS_ID),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, after_data, comment, source, created_at)
        VALUES (?, 'APP_SETTINGS', ?, 'UPDATE', ?, ?, 'Изменение параметров объекта', 'ADMIN', ?)`)
        .bind(crypto.randomUUID(), SETTINGS_ID, JSON.stringify(before), JSON.stringify(after), now),
    ]);
    return Response.json({ settings: settingsDto(await getAppSettings(db)) });
  } catch (error) { return errorResponse(error); }
}
