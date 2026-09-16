"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CirclePlus, Clock3, Lightbulb, MapPin, Settings2, Trash2, Zap } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Tariff = {
  id: string;
  validFromDate: string;
  pricePerKwh: string;
  comment: string;
  createdAt: string;
  nextValidFromDate: string | null;
  isCurrent: boolean;
  isUsed: boolean;
};

const fieldClass = "h-11 rounded-xl border border-[#d8e3e7] bg-white px-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680]";
const secondaryCards = [
  { title: "Параметры объекта", detail: "Название, часовой пояс и валюта", icon: Settings2 },
  { title: "Зоны", detail: "Размещение приборов", icon: MapPin },
  { title: "Категории", detail: "Группировка потребления", icon: Lightbulb },
  { title: "Журнал изменений", detail: "Неизменяемая история операций", icon: Clock3 },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value}T12:00:00Z`));
}

function formatMoney(value: string) {
  return Number(value).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Не удалось выполнить операцию");
  return body;
}

export function SettingsPage() {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tariff | null>(null);
  const [validFromDate, setValidFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [pricePerKwh, setPricePerKwh] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetch("/api/tariffs", { cache: "no-store" }).then(responseJson<{ tariffs: Tariff[] }>);
      setTariffs(data.tariffs);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить тарифы");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const current = useMemo(() => tariffs.find(tariff => tariff.isCurrent) ?? null, [tariffs]);

  async function createTariff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      await fetch("/api/tariffs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ validFromDate, pricePerKwh, comment }) }).then(responseJson);
      setAddOpen(false); setPricePerKwh(""); setComment("");
      setNotice("Новая версия тарифа сохранена. Стоимость в сверке будет рассчитана по дате часа.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить тариф");
    } finally { setSaving(false); }
  }

  async function deleteTariff() {
    if (!deleteTarget) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await fetch(`/api/tariffs/${deleteTarget.id}`, { method: "DELETE" }).then(responseJson);
      setDeleteTarget(null); setNotice("Неиспользованная версия тарифа удалена."); await load();
    } catch (requestError) {
      setDeleteTarget(null); setError(requestError instanceof Error ? requestError.message : "Не удалось удалить тариф");
    } finally { setSaving(false); }
  }

  return <>
    {error && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#efc7bd] bg-[#fff4f1] p-4 text-sm text-[#8c3f2c]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}<Button variant="outline" size="sm" className="ml-auto" onClick={() => void load()}>Повторить</Button></div>}
    {notice && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#bfe2d6] bg-[#eef8f4] p-4 text-sm text-[#28745f]" role="status"><CheckCircle2 className="mt-0.5 shrink-0" size={17} />{notice}</div>}
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6edef] p-5 sm:p-6"><div><div className="flex items-center gap-2"><Zap className="text-[#1e7680]" size={18} /><h2 className="section-title">Тарифы</h2></div><p className="mt-1 text-sm text-[#738792]">Версии применяются с указанной даты; использованная история защищена от удаления.</p></div><Button className="rounded-xl bg-[#153d59] text-white" onClick={() => { setError(""); setAddOpen(true); }}><CirclePlus size={16} />Добавить тариф</Button></div>
      <div className="grid gap-3 border-b border-[#e6edef] bg-[#f7fafb] p-5 sm:grid-cols-2 sm:p-6"><div><p className="eyebrow">Текущий тариф</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#14364b]">{current ? `${formatMoney(current.pricePerKwh)} ₽` : "—"} <span className="text-sm font-medium">/ кВт⋅ч</span></p></div><div className="sm:text-right"><p className="eyebrow">Действует с</p><p className="mt-2 text-lg font-semibold text-[#14364b]">{current ? formatDate(current.validFromDate) : "Тариф ещё не задан"}</p></div></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Действует с</TableHead><TableHead>Цена за кВт⋅ч</TableHead><TableHead>Статус</TableHead><TableHead>Комментарий</TableHead><TableHead className="text-right">Действия</TableHead></TableRow></TableHeader><TableBody>{tariffs.map(tariff => <TableRow key={tariff.id}><TableCell className="font-medium text-[#17374c]">{formatDate(tariff.validFromDate)}</TableCell><TableCell>{formatMoney(tariff.pricePerKwh)} ₽</TableCell><TableCell><Badge variant="outline" className={tariff.isCurrent ? "border-[#bfe2d6] bg-[#eef8f4] text-[#28745f]" : tariff.validFromDate > new Date().toISOString().slice(0, 10) ? "border-[#c8dce5] bg-[#f2f7f9] text-[#426274]" : "border-[#d8dee1] bg-[#f7f8f8] text-[#687e8a]"}>{tariff.isCurrent ? "Текущий" : tariff.validFromDate > new Date().toISOString().slice(0, 10) ? "Будущий" : "Завершён"}</Badge>{tariff.isUsed && <span className="ml-2 text-xs text-[#718590]">использован</span>}</TableCell><TableCell className="max-w-sm text-[#536d7b]">{tariff.comment || "—"}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" disabled={tariff.isUsed || saving} onClick={() => setDeleteTarget(tariff)} aria-label={tariff.isUsed ? "Использованный тариф защищён от удаления" : `Удалить тариф с ${formatDate(tariff.validFromDate)}`} title={tariff.isUsed ? "Использованный тариф нельзя удалить" : "Удалить неиспользованный тариф"}><Trash2 size={16} /></Button></TableCell></TableRow>)}{!loading && !tariffs.length && <TableRow><TableCell colSpan={5} className="py-10 text-center"><p className="font-medium text-[#29475a]">Тарифы ещё не добавлены</p><p className="mt-1 text-sm text-[#718590]">Энергия продолжит рассчитываться, но стоимость останется пустой.</p></TableCell></TableRow>}{loading && <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-[#718590]">Загрузка тарифов…</TableCell></TableRow>}</TableBody></Table></div>
    </section>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{secondaryCards.map(({ title, detail, icon: Icon }) => <div className="surface-card flex items-center gap-4 p-5" key={title}><i className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e9f1f3] text-[#24516a]"><Icon size={19} /></i><span><strong className="block text-sm font-semibold text-[#17374c]">{title}</strong><span className="mt-1 block text-sm text-[#738792]">{detail}</span></span></div>)}</div>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Новая версия тарифа</DialogTitle><DialogDescription>Версия начнёт действовать с выбранной даты. Старые расчёты до этой даты сохранят прежний тариф.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={createTariff}><label className="grid gap-2 text-sm font-medium text-[#29475a]">Действует с<input className={fieldClass} type="date" value={validFromDate} onChange={event => setValidFromDate(event.target.value)} required /></label><label className="grid gap-2 text-sm font-medium text-[#29475a]">Цена за кВт⋅ч, ₽<input className={fieldClass} inputMode="decimal" placeholder="3,300000" value={pricePerKwh} onChange={event => setPricePerKwh(event.target.value)} required /></label><label className="grid gap-2 text-sm font-medium text-[#29475a]">Комментарий<textarea className="min-h-24 rounded-xl border border-[#d8e3e7] bg-white p-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680]" maxLength={500} placeholder="Причина изменения тарифа" value={comment} onChange={event => setComment(event.target.value)} /></label><DialogFooter><Button variant="outline" type="button" onClick={() => setAddOpen(false)}>Отмена</Button><Button className="bg-[#153d59] text-white" disabled={saving} type="submit">{saving ? "Сохраняем…" : "Сохранить тариф"}</Button></DialogFooter></form></DialogContent></Dialog>

    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить версию тарифа?</AlertDialogTitle><AlertDialogDescription>Можно удалить только версию, которая ещё не участвовала в сохранённом расчёте. Это действие будет записано в журнал изменений.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={saving} onClick={() => void deleteTariff()}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
