import { errorResponse, getD1, validateDate } from "@/lib/energy-db";
import { logApiDuration } from "@/lib/metrics";

type AuditRow = { id: string; entity_type: string; entity_id: string; action: string; before_data: string | null; after_data: string | null; comment: string; source: string; created_at: string };

function dto(row: AuditRow) {
  const parse = (value: string | null) => { if (!value) return null; try { return JSON.parse(value); } catch { return value; } };
  return { id: row.id, entityType: row.entity_type, entityId: row.entity_id, action: row.action, before: parse(row.before_data), after: parse(row.after_data), comment: row.comment, source: row.source, createdAt: row.created_at };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25)));
    const filters: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: string) => { if (value) { filters.push(`${column} = ?`); values.push(value); } };
    add("entity_type", String(url.searchParams.get("entityType") ?? "").trim());
    add("action", String(url.searchParams.get("action") ?? "").trim());
    add("source", String(url.searchParams.get("source") ?? "").trim());
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from) { filters.push("created_at >= ?"); values.push(`${validateDate(from)}T00:00:00.000Z`); }
    if (to) { filters.push("created_at <= ?"); values.push(`${validateDate(to)}T23:59:59.999Z`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const db = getD1();
    const [rows, total] = await Promise.all([
      db.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...values, pageSize, (page - 1) * pageSize).all<AuditRow>(),
      db.prepare(`SELECT COUNT(*) AS count FROM audit_log ${where}`).bind(...values).first<{ count: number }>(),
    ]);
    const response = Response.json({ entries: rows.results.map(dto), page, pageSize, total: Number(total?.count ?? 0) });
    logApiDuration("audit", startedAt);
    return response;
  } catch (error) { logApiDuration("audit", startedAt, 500); return errorResponse(error); }
}
