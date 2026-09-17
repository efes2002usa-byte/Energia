import { getD1, microsToDecimal, parseDecimalToMicros, validateDate, validateHour, ValidationError } from "@/lib/energy-db";

export { getD1, microsToDecimal, validateDate, validateHour, ValidationError };

export type ReferenceRow = {
  id: string;
  name: string;
  normalized_name: string;
  description: string;
  sort_order: number;
  is_active: number;
  is_system?: number;
  device_count?: number;
};

export type DeviceRow = {
  id: string;
  name: string;
  description: string;
  active_from_date: string;
  inactive_from_date: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
  zone_id: string;
  zone_name: string;
  category_id: string;
  category_name: string;
  placement_valid_from: string;
  consumption_valid_from: string;
  mode: "HOURLY_AVERAGE" | "POWER_FACTOR";
  consumption_per_hour_micros: number | null;
  nominal_power_micros: number | null;
  load_factor_ppm: number | null;
  quantity: number;
  consumption_comment: string;
};

const DEFAULT_ZONES = ["Барная стойка", "Кухня", "Зал", "Склад"];
const DEFAULT_CATEGORIES = ["Кухонное оборудование", "Холодильники", "Вентиляция", "Освещение"];

export function cleanName(value: unknown, label = "Название") {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new ValidationError("NAME_REQUIRED", `${label} обязательно`);
  if (name.length > 120) throw new ValidationError("NAME_TOO_LONG", `${label} не должно превышать 120 символов`);
  return name;
}

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function validateQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new ValidationError("INVALID_QUANTITY", "Количество должно быть целым числом не меньше 1");
  }
  return quantity;
}

export function validateMode(value: unknown) {
  if (value !== "HOURLY_AVERAGE" && value !== "POWER_FACTOR") {
    throw new ValidationError("INVALID_MODE", "Выберите режим потребления");
  }
  return value;
}

export function parseConsumption(payload: Record<string, unknown>) {
  const mode = validateMode(payload.mode);
  const quantity = validateQuantity(payload.quantity);
  if (mode === "HOURLY_AVERAGE") {
    const consumptionPerHourMicros = parseDecimalToMicros(payload.consumptionPerHourKwh, "Расход за час");
    if (consumptionPerHourMicros <= 0) throw new ValidationError("INVALID_CONSUMPTION", "Расход за час должен быть больше нуля");
    return { mode, quantity, consumptionPerHourMicros, nominalPowerMicros: null, loadFactorPpm: null };
  }
  const nominalPowerMicros = parseDecimalToMicros(payload.nominalPowerKw, "Номинальная мощность");
  const loadFactorPpm = parseDecimalToMicros(payload.loadFactor, "Коэффициент загрузки");
  if (nominalPowerMicros <= 0) throw new ValidationError("INVALID_POWER", "Номинальная мощность должна быть больше нуля");
  if (loadFactorPpm <= 0 || loadFactorPpm > 1_000_000) throw new ValidationError("INVALID_LOAD_FACTOR", "Коэффициент загрузки должен быть больше 0 и не больше 1");
  return { mode, quantity, consumptionPerHourMicros: null, nominalPowerMicros, loadFactorPpm };
}

export function consumptionKwh(row: Pick<DeviceRow, "mode" | "consumption_per_hour_micros" | "nominal_power_micros" | "load_factor_ppm" | "quantity">) {
  if (row.mode === "HOURLY_AVERAGE") return (row.consumption_per_hour_micros ?? 0) * row.quantity;
  return Math.floor(((row.nominal_power_micros ?? 0) * (row.load_factor_ppm ?? 0) * row.quantity) / 1_000_000);
}

export function deviceDto(row: DeviceRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    activeFromDate: row.active_from_date,
    inactiveFromDate: row.inactive_from_date,
    isArchived: Boolean(row.is_archived),
    updatedAt: row.updated_at,
    zone: { id: row.zone_id, name: row.zone_name },
    category: { id: row.category_id, name: row.category_name },
    placementValidFrom: row.placement_valid_from,
    consumption: {
      validFromDate: row.consumption_valid_from,
      mode: row.mode,
      consumptionPerHourKwh: row.consumption_per_hour_micros === null ? null : microsToDecimal(row.consumption_per_hour_micros),
      nominalPowerKw: row.nominal_power_micros === null ? null : microsToDecimal(row.nominal_power_micros),
      loadFactor: row.load_factor_ppm === null ? null : microsToDecimal(row.load_factor_ppm),
      quantity: row.quantity,
      calculatedPerHourKwh: microsToDecimal(consumptionKwh(row)),
      comment: row.consumption_comment,
    },
  };
}

export async function ensureReferenceData(db: D1Database) {
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO device_categories (id, name, normalized_name, description, sort_order, is_active, is_system, created_at, updated_at) VALUES ('category-unaccounted', 'Неучтённые потребители', 'неучтённые потребители', 'Системная категория для нераспределённой нагрузки', 0, 1, 1, ?, ?)`).bind(now, now),
    ...DEFAULT_ZONES.map((name, index) => db.prepare(`INSERT OR IGNORE INTO zones (id, name, normalized_name, description, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, '', ?, 1, ?, ?)`).bind(`zone-default-${index + 1}`, name, normalizeName(name), (index + 1) * 10, now, now)),
    ...DEFAULT_CATEGORIES.map((name, index) => db.prepare(`INSERT OR IGNORE INTO device_categories (id, name, normalized_name, description, sort_order, is_active, is_system, created_at, updated_at) VALUES (?, ?, ?, '', ?, 1, 0, ?, ?)`).bind(`category-default-${index + 1}`, name, normalizeName(name), (index + 1) * 10, now, now)),
  ];
  await db.batch(statements);
}

export async function getDevice(db: D1Database, id: string, effectiveDate = "9999-12-31") {
  return db.prepare(`
    SELECT d.*,
      pv.zone_id, z.name AS zone_name, pv.category_id, c.name AS category_name, pv.valid_from_date AS placement_valid_from,
      cv.valid_from_date AS consumption_valid_from, cv.mode, cv.consumption_per_hour_micros,
      cv.nominal_power_micros, cv.load_factor_ppm, cv.quantity, cv.comment AS consumption_comment
    FROM devices d
    JOIN device_placement_versions pv ON pv.id = (
      SELECT id FROM device_placement_versions WHERE device_id = d.id AND valid_from_date <= ? ORDER BY valid_from_date DESC LIMIT 1
    )
    JOIN zones z ON z.id = pv.zone_id
    JOIN device_categories c ON c.id = pv.category_id
    JOIN device_consumption_versions cv ON cv.id = (
      SELECT id FROM device_consumption_versions WHERE device_id = d.id AND valid_from_date <= ? ORDER BY valid_from_date DESC LIMIT 1
    )
    WHERE d.id = ?
  `).bind(effectiveDate, effectiveDate, id).first<DeviceRow>();
}

export function validateHours(value: unknown) {
  if (!Array.isArray(value)) throw new ValidationError("INVALID_HOURS", "Передайте массив часов");
  const hours = [...new Set(value.map(validateHour))].sort((a, b) => a - b);
  return hours;
}

export function weekdayForDate(date: string) {
  const day = new Date(`${validateDate(date)}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
