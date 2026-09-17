import { errorResponse, getD1, validateDate, validateHour, ValidationError } from "@/lib/energy-db";
import { enqueueRecalculation, jobDto, processRecalculationQueue, RecalculationJobRow } from "@/lib/recalculation-jobs";

export async function GET(request: Request) {
  try {
    const db = getD1();
    await processRecalculationQueue(db);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25)));
    const status = String(url.searchParams.get("status") ?? "").trim();
    const where = status ? "WHERE status = ?" : "";
    const values = status ? [status] : [];
    const [rows, total] = await Promise.all([
      db.prepare(`SELECT * FROM recalculation_jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...values, pageSize, (page - 1) * pageSize).all<RecalculationJobRow>(),
      db.prepare(`SELECT COUNT(*) AS count FROM recalculation_jobs ${where}`).bind(...values).first<{ count: number }>(),
    ]);
    return Response.json({ jobs: rows.results.map(jobDto), page, pageSize, total: Number(total?.count ?? 0) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { from?: { date?: unknown; hour?: unknown }; to?: { date?: unknown; hour?: unknown }; comment?: unknown };
    const comment = String(payload.comment ?? "").trim();
    if (!comment) throw new ValidationError("COMMENT_REQUIRED", "Для ручного пересчёта обязателен комментарий");
    const from = { date: validateDate(payload.from?.date), hour: validateHour(payload.from?.hour) };
    const to = { date: validateDate(payload.to?.date), hour: validateHour(payload.to?.hour) };
    const row = await enqueueRecalculation(getD1(), { from, to, reason: "MANUAL", comment });
    return Response.json({ job: jobDto(row) }, { status: row.status === "PENDING" ? 202 : 201 });
  } catch (error) { return errorResponse(error); }
}
