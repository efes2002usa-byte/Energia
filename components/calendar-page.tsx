"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, RotateCcw, Save, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type CalendarDevice = {
  id: string; name: string; description: string; zone: { id: string; name: string }; category: { id: string; name: string };
  hours: number[]; source: string; isMaterialized: boolean; isArchived: boolean;
};

const fieldClass = "h-11 rounded-xl border border-[#d8e3e7] bg-white px-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680]";
const today = () => new Intl.DateTimeFormat("en-CA").format(new Date());

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Не удалось выполнить операцию");
  return body;
}

export function CalendarPage() {
  const [date, setDate] = useState(today());
  const [devices, setDevices] = useState<CalendarDevice[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number[]>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("");
  const [category, setCategory] = useState("");

  const load = useCallback(async (selectedDate: string) => {
    setLoading(true); setError(""); setNotice("");
    try {
      const data = await fetch(`/api/calendar/days/${selectedDate}`, { cache: "no-store" }).then(json<{ devices: CalendarDevice[] }>);
      setDevices(data.devices); setDrafts(Object.fromEntries(data.devices.map(device => [device.id, device.hours]))); setDirty(new Set());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить календарь"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  const zones = useMemo(() => [...new Map(devices.map(device => [device.zone.id, device.zone])).values()], [devices]);
  const categories = useMemo(() => [...new Map(devices.map(device => [device.category.id, device.category])).values()], [devices]);
  const filtered = useMemo(() => devices.filter(device => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    return (!query || device.name.toLocaleLowerCase("ru-RU").includes(query)) && (!zone || device.zone.id === zone) && (!category || device.category.id === category);
  }), [devices, search, zone, category]);

  function changeDate(next: string) {
    if (dirty.size > 0 && !window.confirm("Есть несохранённые изменения. Перейти к другой дате и отменить их?")) return;
    setDate(next);
  }

  function toggle(deviceId: string, hour: number) {
    setDrafts(current => {
      const hours = current[deviceId] ?? [];
      return { ...current, [deviceId]: hours.includes(hour) ? hours.filter(value => value !== hour) : [...hours, hour].sort((a, b) => a - b) };
    });
    setDirty(current => new Set(current).add(deviceId)); setNotice("");
  }

  async function save(deviceId: string, source: "MANUAL" | "DEFAULT" = "MANUAL") {
    setSaving(deviceId); setError("");
    try {
      const result = await fetch(`/api/calendar/devices/${deviceId}/days/${date}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ hours: drafts[deviceId] ?? [], source }) }).then(json<{ hours: number[] }>);
      setDrafts(current => ({ ...current, [deviceId]: result.hours }));
      setDirty(current => { const next = new Set(current); next.delete(deviceId); return next; });
      setDevices(current => current.map(device => device.id === deviceId ? { ...device, hours: result.hours, source, isMaterialized: true } : device));
      setNotice(source === "DEFAULT" ? "Стандартное расписание применено и материализовано." : "Расписание дня сохранено полностью.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить расписание"); }
    finally { setSaving(null); }
  }

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="section-title">Календарь работы приборов</h2><p className="mt-1 text-sm text-[#738792]">Включите нужные часы и сохраните полное расписание выбранного дня.</p></div>
      <label className="flex items-center gap-2 text-sm font-medium"><CalendarDays size={17} /><input className={fieldClass} type="date" value={date} onChange={event => changeDate(event.target.value)} /></label>
    </div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl border border-[#bfe2d6] bg-[#eef8f4] p-3 text-sm text-[#28745f]">{notice}</div>}
    {dirty.size > 0 && <div className="mb-4 rounded-xl border border-[#f1d49f] bg-[#fff7e7] p-3 text-sm text-[#90600d]">Несохранённые изменения: {dirty.size} прибор(а).</div>}
    <div className="surface-card mb-4 flex flex-wrap gap-2 p-4"><label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3 text-[#8497a2]" size={16} /><input className={`${fieldClass} w-full pl-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск прибора" /></label><select className={fieldClass} value={zone} onChange={event => setZone(event.target.value)}><option value="">Все зоны</option>{zones.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}><option value="">Все категории</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    {loading ? <div className="surface-card flex items-center justify-center gap-2 p-12 text-sm text-[#718590]"><Loader2 className="animate-spin" size={17} />Загрузка календаря…</div> : filtered.length === 0 ? <div className="surface-card p-12 text-center"><p className="font-medium text-[#17374c]">Нет активных приборов</p><p className="mt-1 text-sm text-[#718590]">Создайте прибор или выберите дату его эксплуатации.</p></div> : <div className="grid gap-4">{filtered.map(device => <section className="surface-card overflow-hidden" key={device.id}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6edef] p-4"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-[#17374c]">{device.name}</h3><Badge variant="outline" className={device.isMaterialized ? "border-[#bfe2d6] bg-[#eef8f4] text-[#28745f]" : "border-[#c8dce5] bg-[#f2f7f9] text-[#426274]"}>{device.isMaterialized ? device.source === "DEFAULT" ? "Стандартное" : "Ручное" : "Предпросмотр шаблона"}</Badge></div><p className="mt-1 text-xs text-[#738792]">{device.zone.name} · {device.category.name} · {drafts[device.id]?.length ?? 0} ч</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void save(device.id, "DEFAULT")} disabled={saving === device.id}><RotateCcw size={15} />Применить шаблон</Button><Button size="sm" className="bg-[#153d59] text-white" onClick={() => void save(device.id)} disabled={saving === device.id || !dirty.has(device.id)}>{saving === device.id ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Сохранить</Button></div></div><div className="grid grid-cols-6 gap-2 p-4 sm:grid-cols-12 xl:grid-cols-24">{Array.from({ length: 24 }, (_, hour) => <button type="button" key={hour} onClick={() => toggle(device.id, hour)} aria-pressed={drafts[device.id]?.includes(hour)} aria-label={`${device.name}, ${hour}:00–${hour + 1}:00`} className={`h-12 rounded-xl border text-sm font-medium transition ${drafts[device.id]?.includes(hour) ? "border-[#1e7680] bg-[#1e7680] text-white" : "border-[#dfe8eb] bg-white text-[#59717e] hover:border-[#8db8bd]"}`}>{String(hour).padStart(2, "0")}</button>)}</div></section>)}</div>}
  </>;
}
