import { errorResponse, getD1, microsToDecimal, ValidationError } from "@/lib/energy-db";

type TariffRow = { id: string; valid_from_date: string; price_micros: number; comment: string; created_at: string };

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getD1();
    const tariff = await db.prepare(`SELECT id, valid_from_date, price_micros, comment, created_at FROM tariff_versions WHERE id = ?`)
      .bind(id).first<TariffRow>();
    if (!tariff) throw new ValidationError("TARIFF_NOT_FOUND", "Тариф не найден", 404);
    const next = await db.prepare(`SELECT MIN(valid_from_date) AS valid_from_date FROM tariff_versions WHERE valid_from_date > ?`)
      .bind(tariff.valid_from_date).first<{ valid_from_date: string | null }>();
    const used = await db.prepare(`SELECT 1 AS used FROM hourly_reconciliation
      WHERE date >= ? AND (? IS NULL OR date < ?) LIMIT 1`)
      .bind(tariff.valid_from_date, next?.valid_from_date ?? null, next?.valid_from_date ?? null).first<{ used: number }>();
    if (used) throw new ValidationError("TARIFF_IN_USE", "Использованный тариф нельзя удалить: история расчётов должна сохраниться", 409);

    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`DELETE FROM tariff_versions WHERE id = ?`).bind(id),
      db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_data, comment, source, created_at)
        VALUES (?, 'TARIFF', ?, 'DELETE', ?, ?, 'ADMIN', ?)`)
        .bind(crypto.randomUUID(), id, JSON.stringify({ validFromDate: tariff.valid_from_date, pricePerKwh: microsToDecimal(tariff.price_micros) }), tariff.comment, now),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
