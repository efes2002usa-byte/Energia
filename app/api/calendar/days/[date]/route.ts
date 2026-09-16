import { deviceDto, getD1, getDevice, validateDate, weekdayForDate } from "@/lib/device-db";
import { errorResponse } from "@/lib/energy-db";

export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  try {
    const { date: rawDate } = await params;
    const date = validateDate(rawDate);
    const weekday = weekdayForDate(date);
    const db = getD1();
    const ids = await db.prepare(`
      SELECT id FROM devices
      WHERE active_from_date <= ? AND (inactive_from_date IS NULL OR inactive_from_date > ?)
      ORDER BY name COLLATE NOCASE ASC
    `).bind(date, date).all<{ id: string }>();
    const devices = await Promise.all(ids.results.map(async ({ id }) => {
      const device = await getDevice(db, id, date);
      if (!device) return null;
      const marker = await db.prepare(`SELECT source FROM device_schedule_days WHERE device_id = ? AND date = ?`).bind(id, date).first<{ source: string }>();
      const slots = marker
        ? await db.prepare(`SELECT hour FROM device_on_hour WHERE device_id = ? AND date = ? ORDER BY hour`).bind(id, date).all<{ hour: number }>()
        : await db.prepare(`SELECT hour FROM device_default_schedule WHERE device_id = ? AND weekday = ? ORDER BY hour`).bind(id, weekday).all<{ hour: number }>();
      return { ...deviceDto(device), hours: slots.results.map(row => row.hour), source: marker?.source ?? "DEFAULT_PREVIEW", isMaterialized: Boolean(marker) };
    }));
    return Response.json({ date, weekday, devices: devices.filter(Boolean) });
  } catch (error) {
    return errorResponse(error);
  }
}
