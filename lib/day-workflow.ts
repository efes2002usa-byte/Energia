import { MAIN_METER_ID, ValidationError } from "@/lib/energy-db";

export type DayStatus = "EMPTY" | "CALCULATED" | "FILLED" | "RECONCILED" | "CONFIRMED";

type WorkflowRow = {
  date: string;
  status: DayStatus;
  schedule_completed_at: string | null;
  confirmed_at: string | null;
  confirmation_comment: string;
  unlocked_at: string | null;
  unlock_reason: string;
  updated_at: string;
};

type CountRow = { count: number };
type ReconciliationCounts = { row_count: number; actual_count: number; error_count: number };

async function workflowRow(db: D1Database, date: string) {
  return db.prepare(`SELECT * FROM day_workflows WHERE date = ?`).bind(date).first<WorkflowRow>();
}

export async function dayWorkflow(db: D1Database, date: string) {
  const [row, active, materialized, reconciliation] = await Promise.all([
    workflowRow(db, date),
    db.prepare(`SELECT COUNT(*) AS count FROM devices WHERE active_from_date <= ? AND (inactive_from_date IS NULL OR inactive_from_date > ?)`).bind(date, date).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM device_schedule_days dsd JOIN devices d ON d.id = dsd.device_id WHERE dsd.date = ? AND d.active_from_date <= ? AND (d.inactive_from_date IS NULL OR d.inactive_from_date > ?)`).bind(date, date, date).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS row_count, SUM(CASE WHEN actual_micros IS NOT NULL THEN 1 ELSE 0 END) AS actual_count, SUM(CASE WHEN status = 'CALCULATION_ERROR' THEN 1 ELSE 0 END) AS error_count FROM hourly_reconciliation WHERE meter_id = ? AND date = ?`).bind(MAIN_METER_ID, date).first<ReconciliationCounts>(),
  ]);

  const activeDevices = Number(active?.count ?? 0);
  const materializedDevices = Number(materialized?.count ?? 0);
  const calculatedHours = Number(reconciliation?.row_count ?? 0);
  const actualHours = Number(reconciliation?.actual_count ?? 0);
  const calculationErrors = Number(reconciliation?.error_count ?? 0);
  const scheduleComplete = Boolean(row?.schedule_completed_at) && materializedDevices === activeDevices;
  const factComplete = actualHours === 24;
  const calculationComplete = calculatedHours === 24 && calculationErrors === 0;
  const readyToConfirm = scheduleComplete && factComplete && calculationComplete;
  const status: DayStatus = row?.status === "CONFIRMED"
    ? "CONFIRMED"
    : readyToConfirm
      ? "RECONCILED"
      : scheduleComplete
        ? "FILLED"
        : calculatedHours > 0
          ? "CALCULATED"
          : "EMPTY";

  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO day_workflows (date, status, updated_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET status = excluded.status, updated_at = CASE WHEN day_workflows.status <> excluded.status THEN excluded.updated_at ELSE day_workflows.updated_at END`).bind(date, status, now).run();
  const updated = await workflowRow(db, date);

  return {
    date,
    status,
    scheduleCompletedAt: updated?.schedule_completed_at ?? null,
    confirmedAt: updated?.confirmed_at ?? null,
    confirmationComment: updated?.confirmation_comment ?? "",
    unlockedAt: updated?.unlocked_at ?? null,
    unlockReason: updated?.unlock_reason ?? "",
    readiness: {
      scheduleComplete,
      factComplete,
      calculationComplete,
      readyToConfirm,
      activeDevices,
      materializedDevices,
      actualHours,
      calculatedHours,
      calculationErrors,
    },
  };
}

export async function assertDayEditable(db: D1Database, date: string) {
  const row = await workflowRow(db, date);
  if (row?.status === "CONFIRMED") {
    throw new ValidationError("DAY_CONFIRMED", `День ${date} подтверждён. Сначала разблокируйте его с указанием причины`, 409);
  }
}

export async function assertRangeEditable(db: D1Database, from: string, to: string) {
  const row = await db.prepare(`SELECT date FROM day_workflows WHERE status = 'CONFIRMED' AND date >= ? AND date <= ? ORDER BY date LIMIT 1`).bind(from, to).first<{ date: string }>();
  if (row) throw new ValidationError("DAY_CONFIRMED", `День ${row.date} подтверждён. Сначала разблокируйте его с указанием причины`, 409);
}
