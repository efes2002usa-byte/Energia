import { errorResponse, getD1, microsToDecimal, parseDecimalToMicros, validateDate, ValidationError } from "@/lib/energy-db";
import { enqueueExistingRange, existingEditableEnd } from "@/lib/recalculation-jobs";
import { logApiDuration } from "@/lib/metrics";

type TariffRow = {
  id: string;
  valid_from_date: string;
  price_micros: number;
  comment: string;
  created_at: string;
  next_valid_from_date: string | null;
  is_used: number;
};

function dto(row: TariffRow, today: string) {
  return {
    id: row.id,
    validFromDate: row.valid_from_date,
    pricePerKwh: microsToDecimal(row.price_micros),
    comment: row.comment,
    createdAt: row.created_at,
    nextValidFromDate: row.next_valid_from_date,
    isCurrent: row.valid_from_date <= today && (!row.next_valid_from_date || row.next_valid_from_date > today),
    isUsed: Boolean(row.is_used),
  };
}

export async function GET() {
  const startedAt = performance.now();
  try {
    const db = getD1();
    const today = new Date().toISOString().slice(0, 10);
    const result = await db.prepare(`
      SELECT t.id, t.valid_from_date, t.price_micros, t.comment, t.created_at,
        (SELECT MIN(n.valid_from_date) FROM tariff_versions n WHERE n.valid_from_date > t.valid_from_date) AS next_valid_from_date,
        EXISTS(
          SELECT 1 FROM hourly_reconciliation r
          WHERE r.date >= t.valid_from_date
            AND (r.date < (SELECT MIN(n.valid_from_date) FROM tariff_versions n WHERE n.valid_from_date > t.valid_from_date)
              OR (SELECT MIN(n.valid_from_date) FROM tariff_versions n WHERE n.valid_from_date > t.valid_from_date) IS NULL)
        ) AS is_used
      FROM tariff_versions t
      ORDER BY t.valid_from_date DESC
    `).all<TariffRow>();
    const response = Response.json({ tariffs: result.results.map(row => dto(row, today)) });
    logApiDuration("tariffs", startedAt);
    return response;
  } catch (error) {
    logApiDuration("tariffs", startedAt, 500);
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const payload = await request.json() as { validFromDate?: string; pricePerKwh?: string; comment?: string };
    const validFromDate = validateDate(payload.validFromDate);
    const priceMicros = parseDecimalToMicros(payload.pricePerKwh, "Цена");
    if (priceMicros <= 0) throw new ValidationError("INVALID_TARIFF_PRICE", "Цена тарифа должна быть больше нуля");
    const comment = String(payload.comment ?? "").trim();
    if (comment.length > 500) throw new ValidationError("COMMENT_TOO_LONG", "Комментарий должен быть не длиннее 500 символов");

    const db = getD1();
    const affectedToDate = await existingEditableEnd(db, validFromDate);
    const existing = await db.prepare(`SELECT id FROM tariff_versions WHERE valid_from_date = ?`).bind(validFromDate).first<{ id: string }>();
    if (existing) throw new ValidationError("TARIFF_DATE_CONFLICT", "На эту дату уже существует версия тарифа", 409);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const afterData = JSON.stringify({ validFromDate, pricePerKwh: microsToDecimal(priceMicros) });
    await db.batch([
      db.prepare(`INSERT INTO tariff_versions (id, valid_from_date, price_micros, comment, created_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(id, validFromDate, priceMicros, comment, now),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, after_data, comment, source, created_at)
        VALUES (?, 'TARIFF', ?, 'CREATE', ?, ?, 'ADMIN', ?)`)
        .bind(crypto.randomUUID(), id, afterData, comment, now),
    ]);
    await enqueueExistingRange(db, validFromDate, "TARIFF", comment || "Добавлена версия тарифа", affectedToDate);
    const response = Response.json({ tariff: { id, validFromDate, pricePerKwh: microsToDecimal(priceMicros), comment, createdAt: now } }, { status: 201 });
    logApiDuration("tariffs", startedAt, 201);
    return response;
  } catch (error) {
    logApiDuration("tariffs", startedAt, 500);
    return errorResponse(error);
  }
}
