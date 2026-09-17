import { errorResponse, getD1, validateDate } from "@/lib/energy-db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = validateDate(url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10));
    const to = validateDate(url.searchParams.get("to") ?? from);
    const db = getD1();
    const rows = await db.prepare(`SELECT date, status, schedule_completed_at, confirmed_at, updated_at FROM day_workflows WHERE date BETWEEN ? AND ? ORDER BY date DESC`).bind(from, to).all<{ date: string; status: string; schedule_completed_at: string | null; confirmed_at: string | null; updated_at: string }>();
    return Response.json({ days: rows.results.map(row => ({ date: row.date, status: row.status, scheduleCompletedAt: row.schedule_completed_at, confirmedAt: row.confirmed_at, updatedAt: row.updated_at })), from, to });
  } catch (error) {
    return errorResponse(error);
  }
}
