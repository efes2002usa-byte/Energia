"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, CircleGauge, Gauge, Pencil, Plus, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MeterReading = {
  id: string;
  date: string;
  hour: number;
  valueKwh: string;
  comment: string;
};

type IntervalHour = {
  date: string;
  hour: number;
  automaticKwh: string | null;
  manualKwh: string | null;
  finalKwh: string;
  quality: "EXACT" | "INTERPOLATED" | "MANUAL";
  comment: string;
};

type IntervalData = {
  left: MeterReading;
  right: MeterReading;
  totalKwh: string;
  hours: IntervalHour[];
};

type ReadingPreview = {
  previous: MeterReading | null;
  next: MeterReading | null;
  intervals: {
    before: { hours: number; consumptionKwh: string } | null;
    after: { hours: number; consumptionKwh: string } | null;
  };
  affected: { from: { date: string; hour: number }; to: { date: string; hour: number } };
};

const fieldClass = "h-11 rounded-xl border border-[#d8e3e7] bg-white px-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680]";

function formatKwh(value: string | number) {
  return Number(value).toLocaleString("ru-RU", { minimumFractionDigits: 3, maximumFractionDigits: 6 });
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${date}T12:00:00Z`));
}

function ReadingPreviewPanel({ preview }: { preview: ReadingPreview }) {
  const reading = (value: MeterReading | null) => value ? `${formatDate(value.date)}, ${String(value.hour).padStart(2, "0")}:00 · ${formatKwh(value.valueKwh)} кВт⋅ч` : "Граница отсутствует";
  return <div className="grid gap-3 rounded-2xl border border-[#dce7ea] bg-[#f7fafb] p-4">
    <div className="grid gap-3 sm:grid-cols-2"><div><p className="eyebrow">Предыдущее показание</p><p className="mt-1 text-sm font-medium text-[#17374c]">{reading(preview.previous)}</p></div><div><p className="eyebrow">Следующее показание</p><p className="mt-1 text-sm font-medium text-[#17374c]">{reading(preview.next)}</p></div></div>
    <div className="grid gap-3 border-t border-[#dce7ea] pt-3 sm:grid-cols-2"><div><p className="eyebrow">Интервал до нового</p><p className="mt-1 text-sm text-[#536d7b]">{preview.intervals.before ? `${formatKwh(preview.intervals.before.consumptionKwh)} кВт⋅ч за ${preview.intervals.before.hours} ч` : "Нет левой границы — факт будет MISSING"}</p></div><div><p className="eyebrow">Интервал после нового</p><p className="mt-1 text-sm text-[#536d7b]">{preview.intervals.after ? `${formatKwh(preview.intervals.after.consumptionKwh)} кВт⋅ч за ${preview.intervals.after.hours} ч` : "Нет правой границы — факт будет MISSING"}</p></div></div>
    <p className="rounded-xl bg-white px-3 py-2 text-sm text-[#536d7b]">Диапазон пересчёта: {formatDate(preview.affected.from.date)} {String(preview.affected.from.hour).padStart(2, "0")}:00 — {formatDate(preview.affected.to.date)} {String(preview.affected.to.hour).padStart(2, "0")}:00</p>
  </div>;
}

function hoursBetween(left: MeterReading, right: MeterReading) {
  const from = new Date(`${left.date}T${String(left.hour).padStart(2, "0")}:00:00Z`).getTime();
  const to = new Date(`${right.date}T${String(right.hour).padStart(2, "0")}:00:00Z`).getTime();
  return Math.round((to - from) / 3_600_000);
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Не удалось выполнить операцию");
  return body;
}

export function MeterPage() {
  const defaultReadingDate = new Intl.DateTimeFormat("en-CA").format(new Date());
  const defaultReadingHour = new Date().getHours();
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editReading, setEditReading] = useState<MeterReading | null>(null);
  const [deleteReading, setDeleteReading] = useState<MeterReading | null>(null);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [intervalLoading, setIntervalLoading] = useState(false);
  const [interval, setInterval] = useState<IntervalData | null>(null);
  const [intervalSource, setIntervalSource] = useState<MeterReading | null>(null);
  const [selectedHour, setSelectedHour] = useState<IntervalHour | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [manualComment, setManualComment] = useState("");
  const [addDate, setAddDate] = useState(defaultReadingDate);
  const [addHour, setAddHour] = useState(defaultReadingHour);
  const [addValue, setAddValue] = useState("");
  const [preview, setPreview] = useState<ReadingPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadReadings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/meter-readings", { cache: "no-store" });
      const data = await readJson<{ readings: MeterReading[] }>(response);
      setReadings(data.readings);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить показания");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReadings(); }, [loadReadings]);

  useEffect(() => {
    if (!addOpen || !addValue.trim()) { setPreview(null); setPreviewError(""); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const response = await fetch("/api/meter-readings/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: addDate, hour: addHour, valueKwh: addValue }), signal: controller.signal });
        const data = await readJson<ReadingPreview>(response);
        setPreview(data);
      } catch (requestError) {
        if (!controller.signal.aborted) { setPreview(null); setPreviewError(requestError instanceof Error ? requestError.message : "Не удалось проверить показание"); }
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [addDate, addHour, addOpen, addValue]);

  const latest = readings[0];
  const currentDayConsumption = useMemo(() => {
    if (readings.length < 2) return null;
    const first = readings.find(reading => reading.date === latest.date);
    const last = [...readings].reverse().find(reading => reading.date === latest.date);
    if (!first || !last || first.id === last.id) return null;
    return Number(first.valueKwh) - Number(last.valueKwh);
  }, [latest, readings]);

  async function submitReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/meter-readings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: data.get("date"), hour: Number(data.get("hour")), valueKwh: data.get("valueKwh"), comment: data.get("comment") }),
      });
      await readJson(response);
      setAddOpen(false);
      setNotice("Показание сохранено. Затронутые интервалы обновлены.");
      form.reset();
      setAddValue("");
      setPreview(null);
      setPreviewError("");
      await loadReadings();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить показание");
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editReading) return;
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/meter-readings/${editReading.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ valueKwh: data.get("valueKwh"), comment: data.get("comment"), expectedUpdatedAt: editReading.updatedAt }),
      });
      await readJson(response);
      setEditReading(null);
      setNotice("Показание изменено и записано в аудит.");
      await loadReadings();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось изменить показание");
    }
  }

  async function confirmDelete() {
    if (!deleteReading) return;
    setError("");
    try {
      const response = await fetch(`/api/meter-readings/${deleteReading.id}`, { method: "DELETE" });
      if (!response.ok) await readJson(response);
      setDeleteReading(null);
      setNotice("Показание удалено. Соседние интервалы будут рассчитаны заново.");
      await loadReadings();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить показание");
    }
  }

  const loadInterval = useCallback(async (reading: MeterReading) => {
    setIntervalLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/meter-readings/${reading.id}/interval`, { cache: "no-store" });
      const data = await readJson<{ interval: IntervalData }>(response);
      setInterval(data.interval);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить интервал");
    } finally {
      setIntervalLoading(false);
    }
  }, []);

  async function openInterval(reading: MeterReading) {
    setIntervalSource(reading);
    setIntervalOpen(true);
    setSelectedHour(null);
    await loadInterval(reading);
  }

  function selectHour(hour: IntervalHour) {
    setSelectedHour(hour);
    setManualValue(hour.manualKwh ?? hour.finalKwh);
    setManualComment(hour.comment);
  }

  async function saveManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHour || !intervalSource) return;
    setError("");
    try {
      const response = await fetch(`/api/manual-consumption/${selectedHour.date}/${selectedHour.hour}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumptionKwh: manualValue, comment: manualComment }),
      });
      await readJson(response);
      setNotice(`Ручной расход за ${String(selectedHour.hour).padStart(2, "0")}:00 сохранён.`);
      setSelectedHour(null);
      await loadInterval(intervalSource);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить ручной расход");
    }
  }

  async function removeManual() {
    if (!selectedHour || !intervalSource) return;
    setError("");
    try {
      const response = await fetch(`/api/manual-consumption/${selectedHour.date}/${selectedHour.hour}`, { method: "DELETE" });
      if (!response.ok) await readJson(response);
      setNotice(`Ручное значение за ${String(selectedHour.hour).padStart(2, "0")}:00 удалено.`);
      setSelectedHour(null);
      await loadInterval(intervalSource);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить ручной расход");
    }
  }

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[#637b89]">Показания сохраняются постоянно и проверяются по соседним значениям.</p>
      <Button className="rounded-xl bg-[#153d59] text-white" onClick={() => { setError(""); setAddOpen(true); }}><Plus size={16} />Добавить показание</Button>
    </div>

    {error && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#efc7bd] bg-[#fff4f1] p-4 text-sm text-[#8c3f2c]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={17} /><span className="flex-1">{error}</span><Button variant="outline" size="sm" onClick={() => void loadReadings()}><RefreshCw size={15} />Повторить</Button></div>}
    {notice && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#bfe2d6] bg-[#eef8f4] p-4 text-sm text-[#28745f]" role="status"><CheckCircle2 className="mt-0.5 shrink-0" size={17} />{notice}</div>}

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="surface-card p-5"><Gauge size={18} className="text-[#1e7680]" /><p className="eyebrow mt-4">Последнее показание</p><p className="mt-2 text-2xl font-semibold text-[#14364b]">{latest ? formatKwh(latest.valueKwh) : "—"}</p><p className="mt-1 text-sm text-[#718590]">{latest ? `${formatDate(latest.date)}, ${String(latest.hour).padStart(2, "0")}:00` : "Добавьте первое показание"}</p></div>
      <div className="surface-card p-5"><Activity size={18} className="text-[#b57a17]" /><p className="eyebrow mt-4">Расход за последний день</p><p className="mt-2 text-2xl font-semibold text-[#14364b]">{currentDayConsumption === null ? "—" : `${formatKwh(currentDayConsumption)} кВт⋅ч`}</p><p className="mt-1 text-sm text-[#718590]">По сохранённым границам дня</p></div>
      <div className="surface-card p-5"><CircleGauge size={18} className="text-[#315f7c]" /><p className="eyebrow mt-4">Основной счётчик</p><p className="mt-2 text-2xl font-semibold text-[#14364b]">Бар №1</p><p className="mt-1 text-sm text-[#718590]">Активен · данные в D1</p></div>
    </div>

    <div className="surface-card mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e6edef] p-5"><div><h2 className="section-title">История показаний</h2><p className="mt-1 text-sm text-[#738792]">Между соседними показаниями расход распределяется по часам.</p></div><Button variant="ghost" size="icon" onClick={() => void loadReadings()} aria-label="Обновить показания"><RefreshCw size={17} /></Button></div>
      {loading ? <div className="p-8 text-center text-sm text-[#718590]">Загрузка показаний…</div> : readings.length === 0 ? <div className="p-8 text-center"><p className="font-medium text-[#17374c]">Показаний пока нет</p><p className="mt-1 text-sm text-[#718590]">Добавьте первое накопительное значение счётчика.</p></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Час</TableHead><TableHead>Показание, кВт⋅ч</TableHead><TableHead>Расход до следующего</TableHead><TableHead>Комментарий</TableHead><TableHead className="text-right">Действия</TableHead></TableRow></TableHeader><TableBody>{readings.map((reading, index) => { const next = index > 0 ? readings[index - 1] : null; const intervalHours = next ? hoursBetween(reading, next) : 0; const delta = next ? Number(next.valueKwh) - Number(reading.valueKwh) : 0; return <TableRow key={reading.id}><TableCell>{formatDate(reading.date)}</TableCell><TableCell>{String(reading.hour).padStart(2, "0")}:00</TableCell><TableCell className="font-medium text-[#17374c]">{formatKwh(reading.valueKwh)}</TableCell><TableCell>{next ? `${formatKwh(delta)} / ${intervalHours} ч` : "—"}</TableCell><TableCell className="max-w-52 truncate text-[#637b89]">{reading.comment || "—"}</TableCell><TableCell><div className="flex justify-end gap-1">{next && <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void openInterval(reading)}><SlidersHorizontal size={15} />Уточнить факт</Button>}<Button variant="ghost" size="icon" onClick={() => { setError(""); setEditReading(reading); }} aria-label={`Изменить показание ${formatDate(reading.date)} ${reading.hour}:00`}><Pencil size={16} /></Button><Button variant="ghost" size="icon" className="text-[#a54b39]" onClick={() => setDeleteReading(reading)} aria-label={`Удалить показание ${formatDate(reading.date)} ${reading.hour}:00`}><Trash2 size={16} /></Button></div></TableCell></TableRow>; })}</TableBody></Table></div>}
    </div>

    <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setPreview(null); setPreviewError(""); } }}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl"><DialogHeader><DialogTitle>Новое показание</DialogTitle><DialogDescription>До сохранения проверьте соседние показания, расход и диапазон пересчёта.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={submitReading}>
      {error && <div className="flex items-start gap-3 rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-[#29475a]">Дата<input className={fieldClass} value={addDate} onChange={event => setAddDate(event.target.value)} name="date" required type="date" /></label><label className="grid gap-2 text-sm font-medium text-[#29475a]">Час<select className={fieldClass} value={addHour} onChange={event => setAddHour(Number(event.target.value))} name="hour">{Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label></div>
      <label className="grid gap-2 text-sm font-medium text-[#29475a]">Показание, кВт⋅ч<input className={fieldClass} value={addValue} onChange={event => setAddValue(event.target.value)} name="valueKwh" min="0" placeholder="15860,400000" required step="0.000001" inputMode="decimal" /></label>
      {previewLoading && <div className="rounded-xl bg-[#f3f7f8] p-4 text-sm text-[#718590]">Проверяем соседние показания…</div>}
      {previewError && <div className="rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]">{previewError}</div>}
      {preview && <ReadingPreviewPanel preview={preview} />}
      <label className="grid gap-2 text-sm font-medium text-[#29475a]">Комментарий<textarea className="min-h-24 rounded-xl border border-[#d8e3e7] bg-white p-3 text-sm outline-none focus:border-[#1e7680]" name="comment" placeholder="Например, снято вручную со счётчика" /></label>
      <DialogFooter><Button variant="outline" type="button" onClick={() => setAddOpen(false)}>Отмена</Button><Button className="bg-[#153d59] text-white" disabled={previewLoading || Boolean(previewError) || !preview} type="submit">Сохранить показание</Button></DialogFooter>
    </form></DialogContent></Dialog>

    <Dialog open={Boolean(editReading)} onOpenChange={(open) => !open && setEditReading(null)}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>Изменить показание</DialogTitle><DialogDescription>{editReading ? `${formatDate(editReading.date)}, ${String(editReading.hour).padStart(2, "0")}:00. Дата и час не изменяются.` : ""}</DialogDescription></DialogHeader>{editReading && <form className="grid gap-4" onSubmit={submitEdit}>{error && <div className="flex items-start gap-3 rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}</div>}<label className="grid gap-2 text-sm font-medium text-[#29475a]">Показание, кВт⋅ч<input className={fieldClass} defaultValue={editReading.valueKwh} name="valueKwh" min="0" required step="0.000001" /></label><label className="grid gap-2 text-sm font-medium text-[#29475a]">Комментарий<textarea className="min-h-24 rounded-xl border border-[#d8e3e7] bg-white p-3 text-sm outline-none focus:border-[#1e7680]" defaultValue={editReading.comment} name="comment" /></label><DialogFooter><Button variant="outline" type="button" onClick={() => setEditReading(null)}>Отмена</Button><Button className="bg-[#153d59] text-white" type="submit">Сохранить изменения</Button></DialogFooter></form>}</DialogContent></Dialog>

    <AlertDialog open={Boolean(deleteReading)} onOpenChange={(open) => !open && setDeleteReading(null)}><AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Удалить показание?</AlertDialogTitle><AlertDialogDescription>Соседние интервалы объединятся и потребуют повторного расчёта. Операция будет записана в аудит.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <Dialog open={intervalOpen} onOpenChange={(open) => { setIntervalOpen(open); if (!open) { setInterval(null); setSelectedHour(null); } }}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-3xl"><DialogHeader><DialogTitle>Ручное уточнение расхода</DialogTitle><DialogDescription>{interval ? `${formatDate(interval.left.date)} ${String(interval.left.hour).padStart(2, "0")}:00 — ${formatDate(interval.right.date)} ${String(interval.right.hour).padStart(2, "0")}:00 · всего ${formatKwh(interval.totalKwh)} кВт⋅ч` : "Загрузка интервала…"}</DialogDescription></DialogHeader>{error && <div className="flex items-start gap-3 rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}</div>}{intervalLoading ? <div className="p-8 text-center text-sm text-[#718590]">Рассчитываем часы…</div> : interval && <div className="grid gap-5"><div className="overflow-hidden rounded-xl border border-[#dfe8eb]"><Table><TableHeader><TableRow><TableHead>Час</TableHead><TableHead>Значение</TableHead><TableHead>Качество</TableHead><TableHead className="text-right">Действие</TableHead></TableRow></TableHeader><TableBody>{interval.hours.map(hour => <TableRow key={`${hour.date}-${hour.hour}`}><TableCell>{formatDate(hour.date)} · {String(hour.hour).padStart(2, "0")}:00–{String((hour.hour + 1) % 24).padStart(2, "0")}:00</TableCell><TableCell className="font-medium">{formatKwh(hour.finalKwh)} кВт⋅ч</TableCell><TableCell><Badge variant="outline" className={hour.quality === "MANUAL" ? "border-[#e7c98f] bg-[#fff7e7] text-[#8f5f0d]" : "border-[#c8dce5] bg-[#f2f7f9] text-[#426274]"}>{hour.quality === "MANUAL" ? "Ручное" : hour.quality === "EXACT" ? "Точное" : "Интерполяция"}</Badge></TableCell><TableCell className="text-right"><Button variant="outline" size="sm" className="rounded-lg" onClick={() => selectHour(hour)}>{hour.manualKwh ? "Изменить" : "Уточнить"}</Button></TableCell></TableRow>)}</TableBody></Table></div>{selectedHour && <form className="grid gap-4 rounded-2xl bg-[#f3f7f8] p-5" onSubmit={saveManual}><div><h3 className="font-semibold text-[#17374c]">{formatDate(selectedHour.date)}, {String(selectedHour.hour).padStart(2, "0")}:00–{String((selectedHour.hour + 1) % 24).padStart(2, "0")}:00</h3><p className="mt-1 text-sm text-[#718590]">После сохранения остаток интервала автоматически перераспределится.</p></div><label className="grid gap-2 text-sm font-medium text-[#29475a]">Ручной расход, кВт⋅ч<input className={fieldClass} value={manualValue} onChange={(event) => setManualValue(event.target.value)} min="0" required step="0.000001" /></label><label className="grid gap-2 text-sm font-medium text-[#29475a]">Комментарий<textarea className="min-h-24 rounded-xl border border-[#d8e3e7] bg-white p-3 text-sm outline-none focus:border-[#1e7680]" value={manualComment} onChange={(event) => setManualComment(event.target.value)} placeholder="Причина ручного уточнения" required /></label><div className="flex flex-wrap justify-end gap-2">{selectedHour.manualKwh && <Button variant="outline" type="button" className="text-[#a54b39]" onClick={() => void removeManual()}>Удалить ручное значение</Button>}<Button variant="outline" type="button" onClick={() => setSelectedHour(null)}>Отмена</Button><Button className="bg-[#153d59] text-white" type="submit">Сохранить и пересчитать</Button></div></form>}</div>}</DialogContent></Dialog>
  </>;
}
