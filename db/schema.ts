import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const meters = sqliteTable("meters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  serialNumber: text("serial_number"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const meterReadings = sqliteTable("meter_readings", {
  id: text("id").primaryKey(),
  meterId: text("meter_id").notNull().references(() => meters.id),
  readingDate: text("reading_date").notNull(),
  readingHour: integer("reading_hour").notNull(),
  valueMicros: integer("value_micros").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("uq_meter_readings_meter_slot").on(table.meterId, table.readingDate, table.readingHour),
  index("idx_meter_readings_meter_date_hour").on(table.meterId, table.readingDate, table.readingHour),
]);

export const manualHourlyConsumption = sqliteTable("manual_hourly_consumption", {
  meterId: text("meter_id").notNull().references(() => meters.id),
  date: text("date").notNull(),
  hour: integer("hour").notNull(),
  consumptionMicros: integer("consumption_micros").notNull(),
  comment: text("comment").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.meterId, table.date, table.hour] }),
  index("idx_manual_consumption_meter_date_hour").on(table.meterId, table.date, table.hour),
]);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  beforeData: text("before_data"),
  afterData: text("after_data"),
  comment: text("comment").notNull().default(""),
  source: text("source").notNull().default("ADMIN"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_audit_log_entity").on(table.entityType, table.entityId),
  index("idx_audit_log_created_at").on(table.createdAt),
]);

export const zones = sqliteTable("zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("uq_zones_normalized_name").on(table.normalizedName),
  index("idx_zones_active_sort").on(table.isActive, table.sortOrder),
]);

export const deviceCategories = sqliteTable("device_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("uq_device_categories_normalized_name").on(table.normalizedName),
  index("idx_device_categories_active_sort").on(table.isActive, table.sortOrder),
]);

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  activeFromDate: text("active_from_date").notNull(),
  inactiveFromDate: text("inactive_from_date"),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_devices_active_dates").on(table.isArchived, table.activeFromDate, table.inactiveFromDate),
]);

export const devicePlacementVersions = sqliteTable("device_placement_versions", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => devices.id),
  validFromDate: text("valid_from_date").notNull(),
  zoneId: text("zone_id").notNull().references(() => zones.id),
  categoryId: text("category_id").notNull().references(() => deviceCategories.id),
  comment: text("comment").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("uq_device_placement_versions_date").on(table.deviceId, table.validFromDate),
  index("idx_device_placement_versions_lookup").on(table.deviceId, table.validFromDate),
  index("idx_device_placement_versions_zone_category").on(table.zoneId, table.categoryId),
]);

export const deviceConsumptionVersions = sqliteTable("device_consumption_versions", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => devices.id),
  validFromDate: text("valid_from_date").notNull(),
  mode: text("mode").notNull(),
  consumptionPerHourMicros: integer("consumption_per_hour_micros"),
  nominalPowerMicros: integer("nominal_power_micros"),
  loadFactorPpm: integer("load_factor_ppm"),
  quantity: integer("quantity").notNull().default(1),
  comment: text("comment").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("uq_device_consumption_versions_date").on(table.deviceId, table.validFromDate),
  index("idx_device_consumption_versions_lookup").on(table.deviceId, table.validFromDate),
]);

export const deviceDefaultSchedule = sqliteTable("device_default_schedule", {
  deviceId: text("device_id").notNull().references(() => devices.id),
  weekday: integer("weekday").notNull(),
  hour: integer("hour").notNull(),
}, (table) => [
  primaryKey({ columns: [table.deviceId, table.weekday, table.hour] }),
  index("idx_device_default_schedule_device_weekday").on(table.deviceId, table.weekday),
]);

export const deviceOnHour = sqliteTable("device_on_hour", {
  deviceId: text("device_id").notNull().references(() => devices.id),
  date: text("date").notNull(),
  hour: integer("hour").notNull(),
  source: text("source").notNull().default("MANUAL"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.deviceId, table.date, table.hour] }),
  index("idx_device_on_hour_date_device").on(table.date, table.deviceId),
]);

export const deviceScheduleDays = sqliteTable("device_schedule_days", {
  deviceId: text("device_id").notNull().references(() => devices.id),
  date: text("date").notNull(),
  source: text("source").notNull().default("MANUAL"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.deviceId, table.date] }),
  index("idx_device_schedule_days_date").on(table.date),
]);

export const deviceHourlyEnergy = sqliteTable("device_hourly_energy", {
  deviceId: text("device_id").notNull().references(() => devices.id),
  date: text("date").notNull(),
  hour: integer("hour").notNull(),
  consumptionVersionId: text("consumption_version_id").notNull().references(() => deviceConsumptionVersions.id),
  placementVersionId: text("placement_version_id").notNull().references(() => devicePlacementVersions.id),
  zoneId: text("zone_id").notNull().references(() => zones.id),
  categoryId: text("category_id").notNull().references(() => deviceCategories.id),
  energyMicros: integer("energy_micros").notNull(),
  formula: text("formula").notNull(),
  calculatedAt: text("calculated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.deviceId, table.date, table.hour] }),
  index("idx_device_hourly_energy_date_hour").on(table.date, table.hour),
  index("idx_device_hourly_energy_zone_date").on(table.zoneId, table.date),
  index("idx_device_hourly_energy_category_date").on(table.categoryId, table.date),
]);

export const hourlyReconciliation = sqliteTable("hourly_reconciliation", {
  meterId: text("meter_id").notNull().references(() => meters.id),
  date: text("date").notNull(),
  hour: integer("hour").notNull(),
  actualMicros: integer("actual_micros"),
  actualQuality: text("actual_quality").notNull(),
  devicesMicros: integer("devices_micros").notNull().default(0),
  deltaMicros: integer("delta_micros"),
  status: text("status").notNull(),
  errorMessage: text("error_message").notNull().default(""),
  calculatedAt: text("calculated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.meterId, table.date, table.hour] }),
  index("idx_hourly_reconciliation_date_status").on(table.date, table.status),
  index("idx_hourly_reconciliation_quality_date").on(table.actualQuality, table.date),
]);
