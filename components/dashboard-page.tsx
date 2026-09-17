"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, RefreshCw, TrendingUp, Wrench, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Daily = { date: string; actualKwh: number | null; devicesKwh: number; actualHours: number; completedHours: number; complete: boolean };
type Breakdown = { name: string; energyKwh: number };
type Alert = { date: string; hour: number; status: string; actualKwh: string | null; devicesKwh: string; deltaKwh: string | null; errorMessage: string };
type Dashboard = {
  from: string; to: string; lastCalculatedAt: string | null;
  settings: { currencyCode: string; percentageTolerance: string; absoluteToleranceKwh: string };
  summary: { actualKwh: string; devicesKwh: string; unallocatedKwh: string; unallocatedPercent: number | null; actualCost: string | null; devicesCost: string | null; unallocatedCost: string | null; completedHours: number; totalHours: number; coveredHours: number; coveragePercent: number; incomplete: boolean };
  extrema: { averageDayKwh: number | null; maximumDay: Daily | null; minimumDay: Daily | null; maximumHour: { date: string; hour: number; actualKwh: number } | null };
  daily: Daily[]; byCategory: Breakdown[]; byZone: Breakdown[]; alerts: Alert[]; errors: string[];
};

const fieldClass = "h-11 rounded-xl border border-[#d8e3e7] bg-white px-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680] focus:ring-2 focus:ring-[#1e7680]/20";
const colors = ["#163b5c", "#1e7680", "#d49a33", "#7d91a2", "#8b6ba8", "#4b8f74"];

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: string, amount: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return isoDate(value); }
function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) { return new Intl.DateTimeFormat("ru-RU", options).format(new Date(`${date}T12:00:00Z`)); }
function energy(value: string | number | null) { return value === null ? "—" : Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 3 }); }
function money(value: string | null, currency: string) { return value === null ? "—" : new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)); }
function hourLabel(hour: number) { return `${String(hour).padStart(2, "0")}:00`; }
function detailUrl(date: string, hour?: number) { return `/reconciliation?from=${date}&to=${date}${hour === undefined ? "" : `&hour=${hour}`}#${hour === undefined ? "hourly" : `hour-${hour}`}`; }

function statusText(status: string) {
  return status === "UNALLOCATED" ? "Нераспределённое потребление" : status === "MODEL_HIGH" ? "Модель выше факта" : status === "CALCULATION_ERROR" ? "Ошибка расчёта" : "Нет фактических данных";
}

function MetricCard({ icon: Icon, label, value, unit, detail, href, tone = "blue" }: { icon: typeof Zap; label: string; value: string; unit: string; detail: string; href: string; tone?: "blue" | "teal" | "amber" }) {
  return <a className="metric-card group text-left" href={href} aria-label={`${label}: открыть подробности`}>
    <div className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" size={18} /></div>
    <p className="eyebrow mt-5">{label}</p>
    <p className="mt-2 flex items-baseline gap-2"><span className="text-[2rem] font-semibold tracking-[-0.05em] text-[#0c263a]">{value}</span><span className="text-sm font-medium text-[#597080]">{unit}</span></p>
    <Separator className="my-4 bg-[#e7edf0]" /><p className="text-sm text-[#637b89]">{detail}</p>
  </a>;
}

function BreakdownList({ items, total }: { items: Breakdown[]; total: number }) {
  if (!items.length) return <p className="rounded-xl border border-dashed border-[#d5e1e5] p-6 text-center text-sm text-[#718590]">За период нет расчётного потребления.</p>;
  return <div className="grid gap-4">{items.map((item, index) => { const percent = total > 0 ? item.energyKwh / total * 100 : 0; return <div key={item.name}>
    <div className="mb-2 flex justify-between gap-3 text-sm"><span className="flex items-center gap-2 font-medium text-[#375567]"><i className="size-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{item.name}</span><span className="font-semibold text-[#17374c]">{percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} % · {energy(item.energyKwh)} кВт⋅ч</span></div>
    <Progress value={percent} className="h-2 bg-[#e5edef] [&>div]:bg-[#1e7680]" />
  </div>; })}</div>;
}

export function DashboardPage() {
  const today = useMemo(() => isoDate(new Date()), []);
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/dashboard?from=${from}&to=${to}`, { cache: "no-store" });
      const body = await response.json() as Dashboard & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "Не удалось загрузить Dashboard");
      if (current === requestId.current) setData(body);
    } catch (requestError) {
      if (current === requestId.current) setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить Dashboard");
    } finally { if (current === requestId.current) setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);
  const currency = data?.settings.currencyCode ?? "RUB";
  const summary = data?.summary;
  const periodLabel = `${formatDate(from)} — ${formatDate(to, { day: "numeric", month: "short", year: "numeric" })}`;
  const totalDevices = Number(summary?.devicesKwh ?? 0);
  const chart = data?.daily.map(day => ({ ...day, label: formatDate(day.date, { day: "2-digit", month: "2-digit" }) })) ?? [];

  function selectPreset(days: number) { setTo(today); setFrom(addDays(today, -(days - 1))); }

  return <>
    <section className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div><p className="mb-2 text-sm font-medium text-[#6e838e]">Обзор энергопотребления</p><h1 className="text-[clamp(2rem,4vw,3.15rem)] font-semibold tracking-[-0.055em] text-[#102d43]">Главная</h1><p className="mt-2 max-w-xl text-[0.95rem] leading-6 text-[#627986]">Факт, расчётная модель и расхождения за выбранный период.</p></div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#dce7ea] bg-white p-2 shadow-[0_9px_30px_rgba(22,57,78,.06)]"><div className="flex rounded-xl bg-[#eef3f4] p-1"><button className={`period-button ${from === addDays(today, -6) && to === today ? "period-button-active" : ""}`} onClick={() => selectPreset(7)} type="button">Неделя</button><button className={`period-button ${from === addDays(today, -29) && to === today ? "period-button-active" : ""}`} onClick={() => selectPreset(30)} type="button">Месяц</button></div><button className="flex h-10 min-w-[210px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-[#29475a] hover:bg-[#f3f7f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e7680]" onClick={() => { setDraftFrom(from); setDraftTo(to); setDialogOpen(true); }} type="button"><CalendarDays size={16} />{periodLabel}</button></div>
    </section>

    {error && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#efc7bd] bg-[#fff4f1] p-4 text-sm text-[#8c3f2c]" role="alert"><span className="flex items-center gap-2"><AlertCircle size={17} />{error}</span><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw size={15} />Повторить</Button></div>}
    {loading && !data && <div className="surface-card grid min-h-52 place-items-center p-8 text-sm text-[#718590]" aria-live="polite">Загружаем почасовые агрегаты…</div>}
    {data && <>
      {summary?.incomplete && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#f1d49f] bg-[#fff7e7] p-4 text-sm text-[#90600d]"><AlertTriangle className="mt-0.5 shrink-0" size={17} /><span><strong className="block">Итог неполный</strong>В расчёт вошли только завершённые часы: {summary.completedHours} из {summary.totalHours}; факт есть для {summary.coveredHours}.</span></div>}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={Zap} label="Фактический расход" value={energy(summary?.actualKwh ?? "0")} unit="кВт⋅ч" detail={money(summary?.actualCost ?? null, currency)} href={`/reconciliation?from=${from}&to=${to}`} />
        <MetricCard icon={Wrench} label="По приборам" value={energy(summary?.devicesKwh ?? "0")} unit="кВт⋅ч" detail={money(summary?.devicesCost ?? null, currency)} href={`/reconciliation?from=${from}&to=${to}`} tone="teal" />
        <MetricCard icon={AlertTriangle} label="Нераспределено" value={energy(summary?.unallocatedKwh ?? "0")} unit="кВт⋅ч" detail={`${money(summary?.unallocatedCost ?? null, currency)} · ${summary?.unallocatedPercent === null ? "—" : `${summary?.unallocatedPercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} % от факта`}`} href={`/reconciliation?from=${from}&to=${to}&status=UNALLOCATED`} tone="amber" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(330px,.88fr)]">
        <div className="surface-card min-w-0"><div className="border-b border-[#e6edef] px-5 py-5 sm:px-6"><h2 className="section-title">Факт и расчёт</h2><p className="mt-1 text-sm text-[#738792]">Суточное потребление; нажмите на дату под графиком для почасовой сверки.</p></div><div className="px-3 pb-4 pt-3 sm:px-5"><div className="h-[290px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 14, right: 8, bottom: 0, left: -16 }}><CartesianGrid vertical={false} stroke="#e6ecef" strokeDasharray="3 5" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#748996", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#8a9aa4", fontSize: 11 }} /><Tooltip formatter={(value, name) => [`${energy(Number(value))} кВт⋅ч`, name === "actualKwh" ? "Факт" : "Расчёт"]} /><Area type="monotone" dataKey="actualKwh" connectNulls={false} stroke="#173f5f" strokeWidth={3} fill="#173f5f" fillOpacity={0.1} /><Area type="monotone" dataKey="devicesKwh" stroke="#d49424" strokeWidth={2.5} strokeDasharray="6 5" fill="transparent" /></AreaChart></ResponsiveContainer></div><div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Открыть день из графика">{chart.map(day => <a className="shrink-0 rounded-lg border border-[#dce6e9] px-2.5 py-1.5 text-xs font-medium text-[#506b7b] hover:bg-[#eef5f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e7680]" href={detailUrl(day.date)} key={day.date}>{day.label}{!day.complete && " · неполно"}</a>)}</div></div></div>
        <div className="surface-card flex flex-col"><div className="flex items-start justify-between px-5 pb-3 pt-5 sm:px-6"><div><h2 className="section-title">Качество данных</h2><p className="mt-1 text-sm text-[#738792]">Только завершённые часы</p></div><Badge variant="outline" className={summary!.coveragePercent >= 95 ? "border-[#bee3d6] bg-[#eef9f5] text-[#24765f]" : "border-[#f1d49f] bg-[#fff7e7] text-[#90600d]"}>{summary!.coveragePercent >= 95 ? "Хорошее" : "Требует внимания"}</Badge></div><div className="px-5 py-4 sm:px-6"><div className="flex items-end justify-between"><p className="text-[2.65rem] font-semibold tracking-[-0.06em] text-[#102d43]">{summary!.coveragePercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}<span className="ml-1 text-xl text-[#506a78]">%</span></p><p className="pb-2 text-sm text-[#6e828e]">{summary!.coveredHours} из {summary!.completedHours} часов</p></div><Progress value={summary!.coveragePercent} className="mt-3 h-2 bg-[#e5edef] [&>div]:bg-[#2b937b]" /></div><Separator /><div className="grid flex-1 grid-cols-2 gap-px bg-[#e7edef]"><a className="bg-white p-5 hover:bg-[#f8fbfb]" href={data.extrema.maximumHour ? detailUrl(data.extrema.maximumHour.date, data.extrema.maximumHour.hour) : `/reconciliation?from=${from}&to=${to}`}><TrendingUp size={18} className="mb-3 text-[#2e806f]" /><p className="eyebrow">Максимальный час</p><p className="mt-2 text-xl font-semibold text-[#15344a]">{energy(data.extrema.maximumHour?.actualKwh ?? null)} кВт⋅ч</p><p className="mt-1 text-xs text-[#748792]">{data.extrema.maximumHour ? `${formatDate(data.extrema.maximumHour.date)}, ${hourLabel(data.extrema.maximumHour.hour)}` : "Нет факта"}</p></a><div className="bg-white p-5"><Activity size={18} className="mb-3 text-[#b67b18]" /><p className="eyebrow">Среднее в день</p><p className="mt-2 text-xl font-semibold text-[#15344a]">{energy(data.extrema.averageDayKwh)} кВт⋅ч</p><p className="mt-1 text-xs text-[#748792]">По дням с фактом</p></div></div></div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <div className="surface-card p-5 sm:p-6"><Tabs defaultValue="categories"><TabsList className="mb-5"><TabsTrigger value="categories">Категории</TabsTrigger><TabsTrigger value="zones">Зоны</TabsTrigger></TabsList><TabsContent value="categories"><BreakdownList items={data.byCategory} total={totalDevices} /></TabsContent><TabsContent value="zones"><BreakdownList items={data.byZone} total={totalDevices} /></TabsContent></Tabs></div>
        <div className="surface-card overflow-hidden"><div className="flex items-start justify-between px-5 pb-4 pt-5 sm:px-6"><div><h2 className="section-title">Требуют внимания</h2><p className="mt-1 text-sm text-[#738792]">Отклонения и неполные часы</p></div><Badge className="bg-[#fff0d4] text-[#925e09] hover:bg-[#fff0d4]">{data.alerts.length}</Badge></div>{data.alerts.length ? <div className="divide-y divide-[#e9eef0] border-y border-[#e9eef0]">{data.alerts.map(alert => <a className="alert-row group" href={detailUrl(alert.date, alert.hour)} key={`${alert.date}-${alert.hour}`}><div className={`alert-symbol ${alert.status === "MISSING" || alert.status === "CALCULATION_ERROR" ? "alert-symbol-critical" : "alert-symbol-warning"}`}><AlertTriangle size={17} /></div><div className="min-w-0 flex-1"><p className="font-medium text-[#15354b]">{statusText(alert.status)}</p><p className="mt-1 text-sm text-[#687f8c]">{formatDate(alert.date)}, {hourLabel(alert.hour)} · разница {energy(alert.deltaKwh)} кВт⋅ч</p></div><ChevronRight size={17} className="text-[#9aabb4]" /></a>)}</div> : <div className="border-y border-[#e9eef0] p-8 text-center text-sm text-[#718590]"><CheckCircle2 className="mx-auto mb-2 text-[#348a73]" />За период нет отклонений.</div>}
          <div className="grid grid-cols-3 gap-px bg-[#e7edef]"><a className="bg-white p-4 text-sm hover:bg-[#f8fbfb]" href={data.extrema.maximumDay ? detailUrl(data.extrema.maximumDay.date) : "#"}><span className="text-[#718590]">Макс. день</span><strong className="mt-1 block text-[#17374c]">{data.extrema.maximumDay ? `${formatDate(data.extrema.maximumDay.date)} · ${energy(data.extrema.maximumDay.actualKwh)}` : "—"}</strong></a><a className="bg-white p-4 text-sm hover:bg-[#f8fbfb]" href={data.extrema.minimumDay ? detailUrl(data.extrema.minimumDay.date) : "#"}><span className="text-[#718590]">Мин. день</span><strong className="mt-1 block text-[#17374c]">{data.extrema.minimumDay ? `${formatDate(data.extrema.minimumDay.date)} · ${energy(data.extrema.minimumDay.actualKwh)}` : "—"}</strong></a><a className="bg-white p-4 text-sm hover:bg-[#f8fbfb]" href={`/reconciliation?from=${from}&to=${to}`}><span className="text-[#718590]">Все часы</span><strong className="mt-1 block text-[#17374c]">Открыть сверку</strong></a></div>
        </div>
      </section>
      <footer className="mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-[#dfe8eb] bg-white/65 px-5 py-4 text-xs text-[#71858f] sm:flex-row sm:items-center"><span>Последний сохранённый пересчёт: {data.lastCalculatedAt ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.lastCalculatedAt)) : "ещё не выполнялся"}</span><span>Допуск: ±{energy(data.settings.percentageTolerance)} % и ±{energy(data.settings.absoluteToleranceKwh)} кВт⋅ч</span></footer>
    </>}

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Выбрать период</DialogTitle><DialogDescription>До 32 календарных дней; период применяется ко всем показателям.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={event => { event.preventDefault(); if (draftFrom <= draftTo) { setFrom(draftFrom); setTo(draftTo); setDialogOpen(false); } }}><label className="grid gap-2 text-sm font-medium text-[#29475a]">Начало<input className={fieldClass} max={draftTo} type="date" value={draftFrom} onChange={event => setDraftFrom(event.target.value)} required /></label><label className="grid gap-2 text-sm font-medium text-[#29475a]">Конец<input className={fieldClass} min={draftFrom} type="date" value={draftTo} onChange={event => setDraftTo(event.target.value)} required /></label><DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button><Button type="submit" className="bg-[#153d59] text-white">Применить</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}
