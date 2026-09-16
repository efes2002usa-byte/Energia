"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Calculator, CheckCircle2, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Detail = { deviceId: string; name: string; zone: string; category: string; energyKwh: string; formula: string };
type Row = { date: string; hour: number; actualKwh: string | null; quality: string; devicesKwh: string; deltaKwh: string | null; deltaPercent: number | null; status: string; details: Detail[] };
type Reconciliation = {
  summary: { actualKwh: string; devicesKwh: string; deltaKwh: string; coveragePercent: number };
  rows: Row[]; errors: string[]; saved?: boolean;
  byZone: Array<{ name: string; energyKwh: string }>;
  byCategory: Array<{ name: string; energyKwh: string }>;
};

const fieldClass = "h-11 rounded-xl border border-[#d8e3e7] bg-white px-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680]";

function format(value: string | null) {
  return value === null ? "—" : Number(value).toLocaleString("ru-RU", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function statusLabel(status: string) {
  return status === "NORMAL" ? "Норма" : status === "UNALLOCATED" ? "Нераспределено" : status === "MODEL_HIGH" ? "Модель завышена" : status === "CALCULATION_ERROR" ? "Ошибка расчёта" : "Нет факта";
}

export function ReconciliationPage() {
  const [from, setFrom] = useState("2026-09-15");
  const [to, setTo] = useState("2026-09-15");
  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const load = useCallback(async (persist = false) => {
    persist ? setSaving(true) : setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reconciliation?from=${from}&to=${to}`, { method: persist ? "POST" : "GET", cache: "no-store" });
      const body = await response.json() as Reconciliation & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "Не удалось выполнить расчёт");
      setData(body);
      if (persist) setNotice(`Пересчёт ${from} — ${to} сохранён по каждому часу.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось выполнить расчёт");
    } finally {
      setLoading(false);
      setSaving(false);
    }
  }, [from, to]);

  useEffect(() => { void load(false); }, [load]);
  const summary = data?.summary ?? { actualKwh: "0", devicesKwh: "0", deltaKwh: "0", coveragePercent: 0 };

  return <>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <p className="max-w-2xl text-sm text-[#637b89]">Факт сопоставляется с приборами по каждому часу. Аномалия отмечается, только если превышены допуски 0,1 кВт⋅ч и 5 %.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-medium text-[#637b89]">С<input className={fieldClass} type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-medium text-[#637b89]">По<input className={fieldClass} type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
        <Button className="h-11 rounded-xl bg-[#153d59] text-white" disabled={saving || loading} onClick={() => void load(true)}><Calculator size={16} />{saving ? "Сохраняем…" : "Пересчитать и сохранить"}</Button>
      </div>
    </div>
    {error && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#efc7bd] bg-[#fff4f1] p-4 text-sm text-[#8c3f2c]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}</div>}
    {notice && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#bfe2d6] bg-[#eef8f4] p-4 text-sm text-[#28745f]" role="status"><CheckCircle2 className="mt-0.5 shrink-0" size={17} />{notice}</div>}
    {data?.errors.length ? <div className="mb-4 rounded-2xl border border-[#f1d49f] bg-[#fff7e7] p-4 text-sm text-[#90600d]">{data.errors.join("; ")}</div> : null}
    <div className="grid gap-4 sm:grid-cols-4">
      <div className="surface-card p-5"><p className="eyebrow">Факт</p><p className="mt-2 text-3xl font-semibold text-[#14364b]">{format(summary.actualKwh)} <span className="text-sm">кВт⋅ч</span></p></div>
      <div className="surface-card p-5"><p className="eyebrow">По приборам</p><p className="mt-2 text-3xl font-semibold text-[#14364b]">{format(summary.devicesKwh)} <span className="text-sm">кВт⋅ч</span></p></div>
      <div className="surface-card p-5"><p className="eyebrow">Разница</p><p className="mt-2 text-3xl font-semibold text-[#a66b0a]">{format(summary.deltaKwh)} <span className="text-sm">кВт⋅ч</span></p></div>
      <div className="surface-card p-5"><p className="eyebrow">Покрытие фактом</p><p className="mt-2 text-3xl font-semibold text-[#14364b]">{summary.coveragePercent} <span className="text-sm">%</span></p></div>
    </div>
    <div className="surface-card mt-4 overflow-hidden">
      <div className="border-b border-[#e6edef] p-5"><h2 className="section-title">Почасовая сверка</h2><p className="mt-1 text-sm text-[#738792]">{loading ? "Выполняем расчёт…" : `${data?.rows.length ?? 0} часов с фактом или включёнными приборами`}</p></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Дата и час</TableHead><TableHead>Факт</TableHead><TableHead>Качество</TableHead><TableHead>Приборы</TableHead><TableHead>Разница</TableHead><TableHead>Статус</TableHead><TableHead /></TableRow></TableHeader><TableBody>{data?.rows.map(row => <TableRow key={`${row.date}-${row.hour}`}><TableCell className="font-medium">{row.date} · {String(row.hour).padStart(2, "0")}:00–{String((row.hour + 1) % 24).padStart(2, "0")}:00</TableCell><TableCell>{format(row.actualKwh)}</TableCell><TableCell><Badge variant="outline" className={row.quality === "MANUAL" ? "border-[#e7c98f] bg-[#fff7e7] text-[#8f5f0d]" : row.quality === "MISSING" ? "border-[#efc7bd] bg-[#fff4f1] text-[#8c3f2c]" : "border-[#c8dce5] bg-[#f2f7f9] text-[#426274]"}>{row.quality === "MANUAL" ? "Ручное" : row.quality === "INTERPOLATED" ? "Интерполяция" : row.quality === "EXACT" ? "Точное" : "Нет факта"}</Badge></TableCell><TableCell>{format(row.devicesKwh)}</TableCell><TableCell className={row.deltaKwh?.startsWith("-") ? "text-[#315f7c]" : "text-[#9a6208]"}>{format(row.deltaKwh)}{row.deltaPercent === null ? "" : ` · ${row.deltaPercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %`}</TableCell><TableCell><Badge variant="outline" className={row.status === "NORMAL" ? "border-[#bfe2d6] bg-[#eef8f4] text-[#28745f]" : row.status === "MISSING" ? "border-[#efc7bd] bg-[#fff4f1] text-[#8c3f2c]" : "border-[#f1d49f] bg-[#fff7e7] text-[#90600d]"}>{statusLabel(row.status)}</Badge></TableCell><TableCell><Button variant="ghost" size="icon" onClick={() => setSelected(row)} aria-label={`Открыть детализацию ${row.date} ${row.hour}:00`}><ChevronRight size={17} /></Button></TableCell></TableRow>)}{!loading && !data?.rows.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-[#718590]">За выбранный период нет факта и включённых приборов.</TableCell></TableRow>}</TableBody></Table></div>
    </div>
    {(data?.byZone.length || data?.byCategory.length) ? <div className="mt-4 grid gap-4 md:grid-cols-2"><AggregateCard title="По зонам" items={data.byZone} /><AggregateCard title="По категориям" items={data.byCategory} /></div> : null}
    <Dialog open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl"><DialogHeader><DialogTitle>Детализация часа</DialogTitle><DialogDescription>{selected ? `${selected.date}, ${String(selected.hour).padStart(2, "0")}:00–${String((selected.hour + 1) % 24).padStart(2, "0")}:00 · ${statusLabel(selected.status)}` : ""}</DialogDescription></DialogHeader>{selected && <div className="grid gap-4"><div className="grid grid-cols-3 gap-3 rounded-xl bg-[#f3f7f8] p-4 text-sm"><div><span className="text-[#718590]">Факт</span><strong className="mt-1 block text-[#17374c]">{format(selected.actualKwh)}</strong></div><div><span className="text-[#718590]">Приборы</span><strong className="mt-1 block text-[#17374c]">{format(selected.devicesKwh)}</strong></div><div><span className="text-[#718590]">Разница</span><strong className="mt-1 block text-[#17374c]">{format(selected.deltaKwh)}</strong></div></div>{selected.details.length ? <div className="overflow-hidden rounded-xl border border-[#dfe8eb]"><Table><TableHeader><TableRow><TableHead>Прибор</TableHead><TableHead>Размещение</TableHead><TableHead>Формула</TableHead><TableHead className="text-right">кВт⋅ч</TableHead></TableRow></TableHeader><TableBody>{selected.details.map(detail => <TableRow key={detail.deviceId}><TableCell className="font-medium">{detail.name}</TableCell><TableCell>{detail.zone}<span className="block text-xs text-[#718590]">{detail.category}</span></TableCell><TableCell className="text-xs text-[#536d7b]">{detail.formula}</TableCell><TableCell className="text-right">{format(detail.energyKwh)}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="rounded-xl border border-dashed border-[#d5e1e5] p-5 text-center text-sm text-[#718590]">В этот час приборы не были включены.</p>}</div>}</DialogContent></Dialog>
  </>;
}

function AggregateCard({ title, items }: { title: string; items: Array<{ name: string; energyKwh: string }> }) {
  return <div className="surface-card p-5"><h2 className="section-title">{title}</h2><div className="mt-4 grid gap-3">{items.map(item => <div className="flex items-center justify-between gap-4 text-sm" key={item.name}><span className="text-[#536d7b]">{item.name}</span><strong className="text-[#17374c]">{format(item.energyKwh)} кВт⋅ч</strong></div>)}</div></div>;
}
