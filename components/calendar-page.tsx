"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, CheckSquare2, Copy, Loader2, LockKeyhole, RefreshCw, RotateCcw, Save, Search, SquareDashedMousePointer, UnlockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CalendarDevice = {
  id: string; name: string; description: string; zone: { id: string; name: string }; category: { id: string; name: string };
  hours: number[]; source: string; isMaterialized: boolean; isArchived: boolean;
};
type CopyPreview = { deviceCount: number; dayCount: number; hourCount: number; conflicts: Array<{ deviceId: string; date: string }> };
type DayStatus = "EMPTY" | "CALCULATED" | "FILLED" | "RECONCILED" | "CONFIRMED";
type DayWorkflow = {
  date: string; status: DayStatus; scheduleCompletedAt: string | null; confirmedAt: string | null; confirmationComment: string;
  readiness: { scheduleComplete: boolean; factComplete: boolean; calculationComplete: boolean; readyToConfirm: boolean; activeDevices: number; materializedDevices: number; actualHours: number; calculatedHours: number; calculationErrors: number };
};

const dayStatusLabels: Record<DayStatus, string> = { EMPTY: "Пустой", CALCULATED: "Рассчитан", FILLED: "Заполнен", RECONCILED: "Сверен", CONFIRMED: "Подтверждён" };

const fieldClass = "h-11 rounded-xl border border-[#d8e3e7] bg-white px-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680]";
const today = () => new Intl.DateTimeFormat("en-CA").format(new Date());

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}

function weekStart(date: string) {
  const value = new Date(`${date}T12:00:00Z`); const day = value.getUTCDay() || 7; value.setUTCDate(value.getUTCDate() - day + 1); return value.toISOString().slice(0, 10);
}

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("");
  const [category, setCategory] = useState("");
  const [rangeFrom, setRangeFrom] = useState(10);
  const [rangeTo, setRangeTo] = useState(14);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyMode, setCopyMode] = useState<"day" | "week">("day");
  const [copySource, setCopySource] = useState(today());
  const [copyTarget, setCopyTarget] = useState(addDays(today(), 1));
  const [copyAll, setCopyAll] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [copyPreview, setCopyPreview] = useState<CopyPreview | null>(null);
  const [copying, setCopying] = useState(false);
  const [day, setDay] = useState<DayWorkflow | null>(null);
  const [dayAction, setDayAction] = useState<"CONFIRM" | "UNLOCK" | null>(null);
  const [dayComment, setDayComment] = useState("");
  const [daySaving, setDaySaving] = useState(false);

  const load = useCallback(async (selectedDate: string) => {
    setLoading(true); setError(""); setNotice("");
    try {
      const [data, workflow] = await Promise.all([
        fetch(`/api/calendar/days/${selectedDate}`, { cache: "no-store" }).then(json<{ devices: CalendarDevice[] }>),
        fetch(`/api/days/${selectedDate}`, { cache: "no-store" }).then(json<{ day: DayWorkflow }>),
      ]);
      setDevices(data.devices); setDrafts(Object.fromEntries(data.devices.map(device => [device.id, device.hours]))); setDirty(new Set()); setSelected(new Set());
      setDay(workflow.day);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить календарь"); }
    finally { setLoading(false); }
  }, []);

  // The effect intentionally refreshes remote calendar state when the selected date changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (day?.status === "CONFIRMED") return;
    setDrafts(current => {
      const hours = current[deviceId] ?? [];
      return { ...current, [deviceId]: hours.includes(hour) ? hours.filter(value => value !== hour) : [...hours, hour].sort((a, b) => a - b) };
    });
    setDirty(current => new Set(current).add(deviceId)); setNotice("");
  }

  function toggleSelected(deviceId: string) {
    setSelected(current => { const next = new Set(current); if (next.has(deviceId)) next.delete(deviceId); else next.add(deviceId); return next; });
  }

  function applyRange(enabled: boolean) {
    if (day?.status === "CONFIRMED") return;
    const from = Math.min(rangeFrom, rangeTo); const to = Math.max(rangeFrom, rangeTo);
    const range = Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index).filter(hour => hour >= 0 && hour <= 23);
    setDrafts(current => {
      const next = { ...current };
      selected.forEach(deviceId => {
        const existing = current[deviceId] ?? [];
        next[deviceId] = enabled ? [...new Set([...existing, ...range])].sort((a, b) => a - b) : existing.filter(hour => !range.includes(hour));
      });
      return next;
    });
    setDirty(current => { const next = new Set(current); selected.forEach(id => next.add(id)); return next; });
    setNotice("");
  }

  async function save(deviceId: string, source: "MANUAL" | "DEFAULT" = "MANUAL") {
    if (day?.status === "CONFIRMED") { setError("Подтверждённый день защищён. Сначала разблокируйте его"); return; }
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

  async function runDayAction(action: "COMPLETE" | "CONFIRM" | "UNLOCK") {
    if (dirty.size > 0) { setError("Сначала сохраните изменения расписания"); return; }
    setDaySaving(true); setError("");
    try {
      const result = await fetch(`/api/days/${date}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, comment: action === "CONFIRM" ? dayComment : undefined, reason: action === "UNLOCK" ? dayComment : undefined }),
      }).then(json<{ day: DayWorkflow }>);
      setDay(result.day); setDayAction(null); setDayComment("");
      await load(date);
      setNotice(action === "COMPLETE" ? "Расписание завершено: шаблоны зафиксированы для всех активных приборов." : action === "CONFIRM" ? "День подтверждён и защищён от изменений." : "День разблокирован и возвращён в статус «Сверен»." );
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить статус дня"); }
    finally { setDaySaving(false); }
  }

  async function saveSelected() {
    for (const deviceId of [...selected].filter(id => dirty.has(id))) await save(deviceId);
  }

  function openCopy() {
    const source = copyMode === "week" ? weekStart(date) : date;
    setCopySource(source); setCopyTarget(copyMode === "week" ? addDays(source, 7) : addDays(source, 1)); setCopyPreview(null); setError(""); setCopyOpen(true);
  }

  function changeCopyMode(mode: "day" | "week") {
    setCopyMode(mode); const source = mode === "week" ? weekStart(date) : date; setCopySource(source); setCopyTarget(mode === "week" ? addDays(source, 7) : addDays(source, 1)); setCopyPreview(null);
  }

  async function runCopy(preview: boolean) {
    const deviceIds = copyAll ? devices.map(device => device.id) : [...selected];
    if (deviceIds.length === 0) { setError("Выберите хотя бы один прибор"); return; }
    setCopying(true); setError("");
    try {
      const body = copyMode === "day" ? { sourceDate: copySource, targetDate: copyTarget, deviceIds, overwrite, preview } : { sourceWeekStart: copySource, targetWeekStart: copyTarget, deviceIds, overwrite, preview };
      const result = await fetch(`/api/calendar/copy-${copyMode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(json<CopyPreview>);
      if (preview) setCopyPreview(result);
      else { setCopyOpen(false); setCopyPreview(null); await load(date); setNotice(`Скопировано: ${result.deviceCount} прибор(а), ${result.dayCount} дн., ${result.hourCount} изменённых часов.`); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось скопировать расписание"); }
    finally { setCopying(false); }
  }

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="section-title">Календарь работы приборов</h2><p className="mt-1 text-sm text-[#738792]">Включите нужные часы и сохраните полное расписание выбранного дня.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={openCopy} disabled={dirty.size > 0 || day?.status === "CONFIRMED"}><Copy size={16} />Копировать</Button><label className="flex items-center gap-2 text-sm font-medium"><CalendarDays size={17} /><input className={fieldClass} type="date" value={date} onChange={event => changeDate(event.target.value)} /></label></div>
    </div>
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]"><span>{error}</span><Button variant="outline" size="sm" onClick={() => void load(date)}><RefreshCw size={15} />Повторить</Button></div>}
    {notice && <div role="status" className="mb-4 rounded-xl border border-[#bfe2d6] bg-[#eef8f4] p-3 text-sm text-[#28745f]">{notice}</div>}
    {dirty.size > 0 && <div className="mb-4 rounded-xl border border-[#f1d49f] bg-[#fff7e7] p-3 text-sm text-[#90600d]">Несохранённые изменения: {dirty.size} прибор(а). Копирование доступно после сохранения.</div>}
    {day && <section className="surface-card mb-4 flex flex-wrap items-center gap-4 p-4"><div className="mr-auto"><div className="flex items-center gap-2"><h3 className="font-semibold text-[#17374c]">Статус дня</h3><Badge className={day.status === "CONFIRMED" ? "bg-[#153d59] text-white" : day.status === "RECONCILED" ? "bg-[#28745f] text-white" : "border-[#c8dce5] bg-[#f2f7f9] text-[#426274]"} variant={day.status === "CONFIRMED" || day.status === "RECONCILED" ? "default" : "outline"}>{dayStatusLabels[day.status]}</Badge></div><p className="mt-1 text-xs text-[#738792]">Расписание {day.readiness.materializedDevices}/{day.readiness.activeDevices} · факт {day.readiness.actualHours}/24 ч · расчёт {day.readiness.calculatedHours}/24 ч{day.readiness.calculationErrors ? ` · ошибок ${day.readiness.calculationErrors}` : ""}</p>{day.status === "CONFIRMED" && day.confirmationComment && <p className="mt-1 text-xs text-[#426274]">Комментарий: {day.confirmationComment}</p>}</div>{day.status === "CONFIRMED" ? <Button variant="outline" onClick={() => { setDayComment(""); setDayAction("UNLOCK"); }}><UnlockKeyhole size={16} />Разблокировать</Button> : <>{!day.readiness.scheduleComplete && <Button variant="outline" onClick={() => void runDayAction("COMPLETE")} disabled={daySaving || dirty.size > 0}>{daySaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Завершить расписание</Button>}{day.status === "RECONCILED" && <Button className="bg-[#153d59] text-white" onClick={() => { setDayComment(""); setDayAction("CONFIRM"); }}><LockKeyhole size={16} />Подтвердить день</Button>}</>}</section>}
    <div className="surface-card mb-4 flex flex-wrap gap-2 p-4"><label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3 text-[#8497a2]" size={16} /><input className={`${fieldClass} w-full pl-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск прибора" /></label><select className={fieldClass} value={zone} onChange={event => setZone(event.target.value)}><option value="">Все зоны</option>{zones.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}><option value="">Все категории</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    {selected.size > 0 && <div className="surface-card mb-4 flex flex-wrap items-end gap-3 p-4"><div className="mr-auto"><p className="font-medium text-[#17374c]">Выбрано приборов: {selected.size}</p><p className="text-xs text-[#738792]">Диапазон включает начальный час и не включает конечный.</p></div><label className="grid gap-1 text-xs">С<input className={`${fieldClass} w-24`} type="number" min="0" max="23" value={rangeFrom} onChange={event => setRangeFrom(Number(event.target.value))} /></label><label className="grid gap-1 text-xs">До<input className={`${fieldClass} w-24`} type="number" min="1" max="24" value={rangeTo} onChange={event => setRangeTo(Number(event.target.value))} /></label><Button variant="outline" onClick={() => applyRange(true)}><CheckSquare2 size={16} />Включить диапазон</Button><Button variant="outline" onClick={() => applyRange(false)}><SquareDashedMousePointer size={16} />Выключить диапазон</Button><Button className="bg-[#153d59] text-white" onClick={() => void saveSelected()} disabled={[...selected].every(id => !dirty.has(id))}><Save size={16} />Сохранить выбранные</Button></div>}
    {loading ? <div className="surface-card flex items-center justify-center gap-2 p-12 text-sm text-[#718590]"><Loader2 className="animate-spin" size={17} />Загрузка календаря…</div> : filtered.length === 0 ? <div className="surface-card p-12 text-center"><p className="font-medium text-[#17374c]">Нет активных приборов</p><p className="mt-1 text-sm text-[#718590]">Создайте прибор или выберите дату его эксплуатации.</p></div> : <div className="grid gap-4">{filtered.map(device => <section className={`surface-card overflow-hidden ${selected.has(device.id) ? "ring-2 ring-[#66a6aa]" : ""}`} key={device.id}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6edef] p-4"><div className="flex items-center gap-3"><input type="checkbox" className="size-5 accent-[#1e7680]" checked={selected.has(device.id)} onChange={() => toggleSelected(device.id)} aria-label={`Выбрать ${device.name}`} /><div><div className="flex items-center gap-2"><h3 className="font-semibold text-[#17374c]">{device.name}</h3><Badge variant="outline" className={device.isMaterialized ? "border-[#bfe2d6] bg-[#eef8f4] text-[#28745f]" : "border-[#c8dce5] bg-[#f2f7f9] text-[#426274]"}>{device.isMaterialized ? device.source === "DEFAULT" ? "Стандартное" : device.source === "COPY_DAY" ? "Копия дня" : device.source === "COPY_WEEK" ? "Копия недели" : "Ручное" : "Предпросмотр шаблона"}</Badge></div><p className="mt-1 text-xs text-[#738792]">{device.zone.name} · {device.category.name} · {drafts[device.id]?.length ?? 0} ч</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void save(device.id, "DEFAULT")} disabled={saving === device.id}><RotateCcw size={15} />Применить шаблон</Button><Button size="sm" className="bg-[#153d59] text-white" onClick={() => void save(device.id)} disabled={saving === device.id || !dirty.has(device.id)}>{saving === device.id ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Сохранить</Button></div></div><div className="grid grid-cols-6 gap-2 p-4 sm:grid-cols-12 xl:grid-cols-24">{Array.from({ length: 24 }, (_, hour) => <button type="button" key={hour} onClick={() => toggle(device.id, hour)} aria-pressed={drafts[device.id]?.includes(hour)} aria-label={`${device.name}, ${hour}:00–${hour + 1}:00`} className={`h-12 rounded-xl border text-sm font-medium transition ${drafts[device.id]?.includes(hour) ? "border-[#1e7680] bg-[#1e7680] text-white" : "border-[#dfe8eb] bg-white text-[#59717e] hover:border-[#8db8bd]"}`}>{String(hour).padStart(2, "0")}</button>)}</div></section>)}</div>}

    <Dialog open={copyOpen} onOpenChange={open => { setCopyOpen(open); if (!open) setError(""); }}><DialogContent className="rounded-2xl sm:max-w-xl"><DialogHeader><DialogTitle>Копировать расписание</DialogTitle><DialogDescription>Сначала проверьте объём изменений. Без перезаписи операция остановится при любом конфликте.</DialogDescription></DialogHeader>{error && <div role="alert" className="rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]">{error}</div>}<div className="grid gap-4"><div className="grid grid-cols-2 gap-2"><Button type="button" variant={copyMode === "day" ? "default" : "outline"} className={copyMode === "day" ? "bg-[#153d59] text-white" : ""} onClick={() => changeCopyMode("day")}>Один день</Button><Button type="button" variant={copyMode === "week" ? "default" : "outline"} className={copyMode === "week" ? "bg-[#153d59] text-white" : ""} onClick={() => changeCopyMode("week")}>Неделя</Button></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">{copyMode === "day" ? "Исходная дата" : "Понедельник исходной недели"}<input className={fieldClass} type="date" value={copySource} onChange={event => { setCopySource(event.target.value); setCopyPreview(null); }} /></label><label className="grid gap-2 text-sm font-medium">{copyMode === "day" ? "Дата назначения" : "Понедельник недели назначения"}<input className={fieldClass} type="date" value={copyTarget} onChange={event => { setCopyTarget(event.target.value); setCopyPreview(null); }} /></label></div><fieldset className="grid gap-2 text-sm"><legend className="mb-1 font-medium">Приборы</legend><label className="flex items-center gap-2"><input name="copyScope" type="radio" checked={copyAll} onChange={() => { setCopyAll(true); setCopyPreview(null); }} />Все активные ({devices.length})</label><label className="flex items-center gap-2"><input name="copyScope" type="radio" checked={!copyAll} onChange={() => { setCopyAll(false); setCopyPreview(null); }} disabled={selected.size === 0} />Только выбранные ({selected.size})</label></fieldset><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overwrite} onChange={event => { setOverwrite(event.target.checked); setCopyPreview(null); }} />Перезаписать существующее расписание</label>{copyPreview && <div className="rounded-xl bg-[#f3f7f8] p-4 text-sm"><p className="font-semibold text-[#17374c]">Будет изменено</p><p className="mt-1">Приборов: {copyPreview.deviceCount} · дней: {copyPreview.dayCount} · изменяемых часов: {copyPreview.hourCount}</p><p className={`mt-2 ${copyPreview.conflicts.length ? "text-[#9a6208]" : "text-[#28745f]"}`}>{copyPreview.conflicts.length ? `Конфликтов: ${copyPreview.conflicts.length}. ${overwrite ? "Они будут перезаписаны." : "Включите перезапись или выберите пустую дату."}` : "Конфликтов нет."}</p></div>}</div><DialogFooter><Button variant="outline" type="button" onClick={() => void runCopy(true)} disabled={copying}>{copying ? <Loader2 className="animate-spin" size={16} /> : null}Проверить</Button><Button type="button" className="bg-[#153d59] text-white" onClick={() => void runCopy(false)} disabled={copying || !copyPreview}>{copying ? <Loader2 className="animate-spin" size={16} /> : <Copy size={16} />}Копировать</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dayAction !== null} onOpenChange={open => { if (!open) { setDayAction(null); setDayComment(""); } }}><DialogContent className="rounded-2xl sm:max-w-lg"><DialogHeader><DialogTitle>{dayAction === "CONFIRM" ? "Подтвердить день" : "Разблокировать день"}</DialogTitle><DialogDescription>{dayAction === "CONFIRM" ? "После подтверждения расписание, показания, ручной расход и пересчёт этого дня будут заблокированы." : "Укажите причину. Действие сохранится в неизменяемом журнале аудита."}</DialogDescription></DialogHeader><label className="grid gap-2 text-sm font-medium">{dayAction === "CONFIRM" ? "Комментарий" : "Причина разблокировки"}<textarea className="min-h-28 rounded-xl border border-[#d8e3e7] bg-white p-3 text-sm outline-none focus:border-[#1e7680]" value={dayComment} onChange={event => setDayComment(event.target.value)} placeholder={dayAction === "CONFIRM" ? "Например: данные проверены управляющим" : "Опишите, что требуется исправить"} /></label><DialogFooter><Button variant="outline" type="button" onClick={() => { setDayAction(null); setDayComment(""); }}>Отмена</Button><Button type="button" className="bg-[#153d59] text-white" disabled={daySaving || !dayComment.trim()} onClick={() => dayAction && void runDayAction(dayAction)}>{daySaving ? <Loader2 className="animate-spin" size={16} /> : dayAction === "CONFIRM" ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}{dayAction === "CONFIRM" ? "Подтвердить" : "Разблокировать"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
