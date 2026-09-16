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
