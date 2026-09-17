import { MAIN_METER_ID, errorResponse, getD1, microsToDecimal, validateDate } from "@/lib/energy-db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ? validateDate(url.searchParams.get("from")) : null;
    const to = url.searchParams.get("to") ? validateDate(url.searchParams.get("to")) : null;
    const rows = await getD1().prepare(`SELECT meter_id, date, hour, consumption_micros, comment, created_at, updated_at FROM manual_hourly_consumption WHERE meter_id = ? AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?) ORDER BY date DESC, hour DESC`).bind(MAIN_METER_ID, from, from, to, to).all<{ meter_id: string; date: string; hour: number; consumption_micros: number; comment: string; created_at: string; updated_at: string }>();
    return Response.json({ entries: rows.results.map(row => ({ meterId: row.meter_id, date: row.date, hour: row.hour, consumptionKwh: microsToDecimal(row.consumption_micros), comment: row.comment, createdAt: row.created_at, updatedAt: row.updated_at })) });
  } catch (error) {
    return errorResponse(error);
  }
}
