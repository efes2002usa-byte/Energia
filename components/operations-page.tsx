"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Clock3, Loader2, Play, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Job = { id: string; from: { date: string; hour: number }; to: { date: string; hour: number }; reason: string; comment: string; status: string; totalHours: number; processedHours: number; progressPercent: number; errorMessage: string; createdAt: string; completedAt: string | null };
type AuditEntry = { id: string; entityType: string; entityId: string; action: string; before: unknown; after: unknown; comment: string; source: string; createdAt: string };

const fieldClass = "h-11 rounded-xl border border-[#d8e3e7] bg-white px-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680]";
const today = () => new Intl.DateTimeFormat("en-CA").format(new Date());
const reasonLabels: Record<string, string> = { CALENDAR: "Календарь", DEVICE: "Прибор", PLACEMENT: "Размещение", ARCHIVE: "Архивирование", METER_READING: "Показание", MANUAL_CONSUMPTION: "Ручной расход", TARIFF: "Тариф", MANUAL: "Ручной запуск", MERGED: "Объединённое" };

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Не удалось выполнить операцию");
  return body;
}

function dateTime(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function slot(value: { date: string; hour: number }) { return `${new Intl.DateTimeFormat("ru-RU").format(new Date(`${value.date}T12:00:00Z`))} ${String(value.hour).padStart(2, "0")}:00`; }
function pretty(value: unknown) { return value === null ? "—" : JSON.stringify(value, null, 2); }

export function OperationsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fromDate, setFromDate] = useState(today());
  const [fromHour, setFromHour] = useState(0);
  const [toDate, setToDate] = useState(today());
  const [toHour, setToHour] = useState(23);
  const [comment, setComment] = useState("");
  const [auditFilters, setAuditFilters] = useState({ from: "", to: "", entityType: "", action: "", source: "" });

  const loadJobs = useCallback(async () => {
    const data = await fetch("/api/recalculation?pageSize=50", { cache: "no-store" }).then(json<{ jobs: Job[] }>);
    setJobs(data.jobs);
  }, []);

  const loadAudit = useCallback(async (filters = auditFilters) => {
    const query = new URLSearchParams({ pageSize: "50" });
    Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
    const data = await fetch(`/api/audit?${query}`, { cache: "no-store" }).then(json<{ entries: AuditEntry[] }>);
    setEntries(data.entries);
  }, [auditFilters]);

  const loadAll = useCallback(async () => {
    setLoading(true); setError("");
    try { await Promise.all([loadJobs(), loadAudit({ from: "", to: "", entityType: "", action: "", source: "" })]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить операции"); }
    finally { setLoading(false); }
  }, [loadAudit, loadJobs]);

  // Remote operation history is synchronized when the page opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadAll(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const data = await fetch("/api/recalculation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: { date: fromDate, hour: fromHour }, to: { date: toDate, hour: toHour }, comment }) }).then(json<{ job: Job }>);
      setComment(""); setNotice(data.job.status === "COMPLETED" ? "Пересчёт завершён." : "Задание пересчёта создано."); await loadJobs();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось запустить пересчёт"); }
    finally { setSaving(false); }
  }

  return <>
    {error && <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-[#efc7bd] bg-[#fff4f1] p-4 text-sm text-[#8c3f2c]"><AlertCircle size={17} />{error}</div>}
    {notice && <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-[#bfe2d6] bg-[#eef8f4] p-4 text-sm text-[#28745f]"><CheckCircle2 size={17} />{notice}</div>}
    <Tabs defaultValue="recalculation"><TabsList className="mb-4 h-auto rounded-xl bg-[#e7eef0] p-1"><TabsTrigger value="recalculation"><Activity size={15} />Пересчёт</TabsTrigger><TabsTrigger value="audit"><Clock3 size={15} />Журнал изменений</TabsTrigger></TabsList>
      <TabsContent value="recalculation" className="grid gap-4">
        <form className="surface-card grid gap-4 p-5 sm:p-6" onSubmit={submit}><div><h2 className="section-title">Ручной пересчёт</h2><p className="mt-1 text-sm text-[#738792]">Диапазон пересчитывается по часам; перекрывающиеся задания объединяются или выполняются последовательно.</p></div><div className="grid gap-3 md:grid-cols-4"><label className="grid gap-2 text-sm font-medium">Дата с<input className={fieldClass} type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label><label className="grid gap-2 text-sm font-medium">Час с<select className={fieldClass} value={fromHour} onChange={event => setFromHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label><label className="grid gap-2 text-sm font-medium">Дата по<input className={fieldClass} type="date" value={toDate} onChange={event => setToDate(event.target.value)} /></label><label className="grid gap-2 text-sm font-medium">Час по<select className={fieldClass} value={toHour} onChange={event => setToHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label></div><label className="grid gap-2 text-sm font-medium">Комментарий<textarea className="min-h-24 rounded-xl border border-[#d8e3e7] bg-white p-3 text-sm outline-none focus:border-[#1e7680]" value={comment} onChange={event => setComment(event.target.value)} required placeholder="Причина ручного пересчёта" /></label><div className="flex justify-end"><Button className="bg-[#153d59] text-white" disabled={saving || !comment.trim()} type="submit">{saving ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}Запустить</Button></div></form>
        <section className="surface-card overflow-hidden"><div className="flex items-center justify-between border-b border-[#e6edef] p-5"><div><h2 className="section-title">История заданий</h2><p className="mt-1 text-sm text-[#738792]">Прогресс, причина и ошибки последних запусков.</p></div><Button variant="outline" size="sm" onClick={() => void loadJobs()}><RefreshCw size={15} />Обновить</Button></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Создано</TableHead><TableHead>Диапазон</TableHead><TableHead>Причина</TableHead><TableHead>Статус</TableHead><TableHead>Прогресс</TableHead><TableHead>Комментарий / ошибка</TableHead></TableRow></TableHeader><TableBody>{jobs.map(job => <TableRow key={job.id}><TableCell>{dateTime(job.createdAt)}</TableCell><TableCell className="whitespace-nowrap">{slot(job.from)} — {slot(job.to)}</TableCell><TableCell>{reasonLabels[job.reason] ?? job.reason}</TableCell><TableCell><Badge variant="outline" className={job.status === "COMPLETED" ? "border-[#bfe2d6] bg-[#eef8f4] text-[#28745f]" : job.status === "FAILED" ? "border-[#efc7bd] bg-[#fff4f1] text-[#8c3f2c]" : "border-[#f1d49f] bg-[#fff7e7] text-[#90600d]"}>{job.status === "COMPLETED" ? "Завершено" : job.status === "FAILED" ? "Ошибка" : job.status === "RUNNING" ? "Выполняется" : "Ожидает"}</Badge></TableCell><TableCell className="min-w-36"><div className="mb-1 text-xs text-[#718590]">{job.processedHours}/{job.totalHours} ч</div><Progress value={job.progressPercent} className="h-2" /></TableCell><TableCell className="max-w-xs text-sm">{job.errorMessage || job.comment || "—"}</TableCell></TableRow>)}{!loading && !jobs.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-[#718590]">Заданий пока нет.</TableCell></TableRow>}</TableBody></Table></div></section>
      </TabsContent>
      <TabsContent value="audit" className="grid gap-4"><section className="surface-card p-5 sm:p-6"><div className="mb-4"><h2 className="section-title">Фильтры журнала</h2><p className="mt-1 text-sm text-[#738792]">Записи доступны только для просмотра.</p></div><div className="grid gap-3 md:grid-cols-5"><input aria-label="Аудит с даты" className={fieldClass} type="date" value={auditFilters.from} onChange={event => setAuditFilters({ ...auditFilters, from: event.target.value })} /><input aria-label="Аудит по дату" className={fieldClass} type="date" value={auditFilters.to} onChange={event => setAuditFilters({ ...auditFilters, to: event.target.value })} /><input aria-label="Тип объекта" className={fieldClass} placeholder="Тип объекта" value={auditFilters.entityType} onChange={event => setAuditFilters({ ...auditFilters, entityType: event.target.value })} /><input aria-label="Действие" className={fieldClass} placeholder="Действие" value={auditFilters.action} onChange={event => setAuditFilters({ ...auditFilters, action: event.target.value })} /><select aria-label="Источник" className={fieldClass} value={auditFilters.source} onChange={event => setAuditFilters({ ...auditFilters, source: event.target.value })}><option value="">Все источники</option><option value="ADMIN">ADMIN</option><option value="SYSTEM">SYSTEM</option></select></div><div className="mt-4 flex justify-end"><Button variant="outline" onClick={() => void loadAudit()}><Search size={16} />Применить</Button></div></section><section className="surface-card overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Время</TableHead><TableHead>Источник</TableHead><TableHead>Действие</TableHead><TableHead>Объект</TableHead><TableHead>Комментарий</TableHead><TableHead>До / после</TableHead></TableRow></TableHeader><TableBody>{entries.map(entry => <TableRow key={entry.id}><TableCell className="whitespace-nowrap">{dateTime(entry.createdAt)}</TableCell><TableCell><Badge variant="outline">{entry.source}</Badge></TableCell><TableCell>{entry.action}</TableCell><TableCell><div className="font-medium">{entry.entityType}</div><div className="max-w-40 truncate text-xs text-[#718590]">{entry.entityId}</div></TableCell><TableCell className="max-w-xs">{entry.comment || "—"}</TableCell><TableCell><details className="min-w-56 text-xs"><summary className="cursor-pointer font-medium text-[#1e7680]">Показать значения</summary><div className="mt-2 grid gap-2"><div><strong>До</strong><pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-[#f3f7f8] p-2 whitespace-pre-wrap">{pretty(entry.before)}</pre></div><div><strong>После</strong><pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-[#f3f7f8] p-2 whitespace-pre-wrap">{pretty(entry.after)}</pre></div></div></details></TableCell></TableRow>)}{!loading && !entries.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-[#718590]">Записей по выбранным фильтрам нет.</TableCell></TableRow>}</TableBody></Table></div></section></TabsContent>
    </Tabs>
  </>;
}
