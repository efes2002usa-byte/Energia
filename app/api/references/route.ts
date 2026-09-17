import { cleanName, ensureReferenceData, getD1, normalizeName, ReferenceRow, ValidationError } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";
import { logApiDuration } from "@/lib/metrics";

function dto(row: ReferenceRow) {
  return { id: row.id, name: row.name, description: row.description, sortOrder: row.sort_order, isActive: Boolean(row.is_active), isSystem: Boolean(row.is_system), deviceCount: row.device_count ?? 0 };
}

export async function GET() {
  const startedAt = performance.now();
  try {
    const db = getD1();
    await ensureReferenceData(db);
    const [zones, categories] = await Promise.all([
      db.prepare(`
        SELECT z.*, COUNT(DISTINCT pv.device_id) AS device_count
        FROM zones z LEFT JOIN device_placement_versions pv ON pv.zone_id = z.id
        GROUP BY z.id ORDER BY z.is_active DESC, z.sort_order ASC, z.name ASC
      `).all<ReferenceRow>(),
      db.prepare(`
        SELECT c.*, COUNT(DISTINCT pv.device_id) AS device_count
        FROM device_categories c LEFT JOIN device_placement_versions pv ON pv.category_id = c.id
        GROUP BY c.id ORDER BY c.is_active DESC, c.sort_order ASC, c.name ASC
      `).all<ReferenceRow>(),
    ]);
    const response = Response.json({ zones: zones.results.map(dto), categories: categories.results.map(dto) });
    logApiDuration("references", startedAt);
    return response;
  } catch (error) {
    logApiDuration("references", startedAt, 500);
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const payload = await request.json() as { kind?: string; name?: unknown; description?: unknown; sortOrder?: unknown };
    const kind = payload.kind;
    if (kind !== "zone" && kind !== "category") throw new ValidationError("INVALID_REFERENCE_KIND", "Неизвестный тип справочника");
    const name = cleanName(payload.name);
    const normalizedName = normalizeName(name);
    const description = String(payload.description ?? "").trim();
    const sortOrder = Number.isInteger(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0;
    const db = getD1();
    await ensureReferenceData(db);
    const table = kind === "zone" ? "zones" : "device_categories";
    const existing = await db.prepare(`SELECT id FROM ${table} WHERE normalized_name = ?`).bind(normalizedName).first<{ id: string }>();
    if (existing) throw new ValidationError("REFERENCE_NAME_EXISTS", "Название уже используется", 409);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    if (kind === "zone") {
      await db.batch([
        db.prepare(`INSERT INTO zones (id, name, normalized_name, description, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(id, name, normalizedName, description, sortOrder, now, now),
        db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'ZONE', ?, 'CREATE', ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), id, JSON.stringify({ name, description, sortOrder }), description, now),
      ]);
    } else {
      await db.batch([
        db.prepare(`INSERT INTO device_categories (id, name, normalized_name, description, sort_order, is_active, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`).bind(id, name, normalizedName, description, sortOrder, now, now),
        db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at) VALUES (?, 'DEVICE_CATEGORY', ?, 'CREATE', ?, ?, 'ADMIN', ?)`).bind(crypto.randomUUID(), id, JSON.stringify({ name, description, sortOrder }), description, now),
      ]);
    }
    const response = Response.json({ id, name, description, sortOrder, isActive: true, isSystem: false, deviceCount: 0 }, { status: 201 });
    logApiDuration("references", startedAt, 201);
    return response;
  } catch (error) {
    logApiDuration("references", startedAt, 500);
    return errorResponse(error);
  }
}
