import { errorResponse, getD1, ValidationError } from "@/lib/energy-db";
import { jobDto, processRecalculationQueue, RecalculationJobRow } from "@/lib/recalculation-jobs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    await processRecalculationQueue(db);
    const row = await db.prepare(`SELECT * FROM recalculation_jobs WHERE id = ?`).bind(id).first<RecalculationJobRow>();
    if (!row) throw new ValidationError("RECALCULATION_NOT_FOUND", "Задание пересчёта не найдено", 404);
    return Response.json({ job: jobDto(row) });
  } catch (error) { return errorResponse(error); }
}
