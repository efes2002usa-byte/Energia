import { buildCopyPlan, copySummary, executeCopy, validateDeviceIds } from "@/lib/calendar-copy";
import { validateDate, ValidationError } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";
import { assertDayEditable } from "@/lib/day-workflow";
import { enqueueRecalculation } from "@/lib/recalculation-jobs";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { sourceDate?: unknown; targetDate?: unknown; deviceIds?: unknown; overwrite?: unknown; preview?: unknown };
    const sourceDate = validateDate(payload.sourceDate);
    const targetDate = validateDate(payload.targetDate);
    if (sourceDate === targetDate) throw new ValidationError("SAME_DATE", "Дата назначения должна отличаться от исходной даты");
    const deviceIds = validateDeviceIds(payload.deviceIds);
    const { db, plan } = await buildCopyPlan(deviceIds, [{ sourceDate, targetDate }]);
    const summary = copySummary(plan);
    if (payload.preview) return Response.json({ preview: true, ...summary });
    await assertDayEditable(db, targetDate);
    if (!payload.overwrite && summary.conflicts.length > 0) return Response.json({ error: { code: "COPY_CONFLICT", message: "В целевой дате уже есть сохранённое расписание" }, ...summary }, { status: 409 });
    await executeCopy(db, plan, "COPY_DAY");
    await enqueueRecalculation(db, { from: { date: targetDate, hour: 0 }, to: { date: targetDate, hour: 23 }, reason: "CALENDAR", comment: `Копирование расписания с ${sourceDate}` });
    return Response.json({ copied: true, ...summary });
  } catch (error) {
    return errorResponse(error);
  }
}
