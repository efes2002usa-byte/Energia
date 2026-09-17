import { addDays, buildCopyPlan, copySummary, executeCopy, validateDeviceIds } from "@/lib/calendar-copy";
import { validateDate, ValidationError, weekdayForDate } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";
import { assertRangeEditable } from "@/lib/day-workflow";
import { enqueueRecalculation } from "@/lib/recalculation-jobs";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { sourceWeekStart?: unknown; targetWeekStart?: unknown; deviceIds?: unknown; overwrite?: unknown; preview?: unknown };
    const sourceWeekStart = validateDate(payload.sourceWeekStart);
    const targetWeekStart = validateDate(payload.targetWeekStart);
    if (weekdayForDate(sourceWeekStart) !== 1 || weekdayForDate(targetWeekStart) !== 1) throw new ValidationError("WEEK_START_REQUIRED", "Начало недели должно приходиться на понедельник");
    if (sourceWeekStart === targetWeekStart) throw new ValidationError("SAME_WEEK", "Неделя назначения должна отличаться от исходной недели");
    const deviceIds = validateDeviceIds(payload.deviceIds);
    const pairs = Array.from({ length: 7 }, (_, index) => ({ sourceDate: addDays(sourceWeekStart, index), targetDate: addDays(targetWeekStart, index) }));
    const { db, plan } = await buildCopyPlan(deviceIds, pairs);
    const summary = copySummary(plan);
    if (payload.preview) return Response.json({ preview: true, ...summary });
    await assertRangeEditable(db, targetWeekStart, addDays(targetWeekStart, 6));
    if (!payload.overwrite && summary.conflicts.length > 0) return Response.json({ error: { code: "COPY_CONFLICT", message: "В целевой неделе есть сохранённые расписания" }, ...summary }, { status: 409 });
    await executeCopy(db, plan, "COPY_WEEK");
    await enqueueRecalculation(db, { from: { date: targetWeekStart, hour: 0 }, to: { date: addDays(targetWeekStart, 6), hour: 23 }, reason: "CALENDAR", comment: `Копирование недели с ${sourceWeekStart}` });
    return Response.json({ copied: true, ...summary });
  } catch (error) {
    return errorResponse(error);
  }
}
