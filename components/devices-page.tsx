"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, ChevronRight, CirclePlus, Gauge, Loader2, MapPin, Pencil, Plus, RefreshCw, Search, Settings2, SlidersHorizontal } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Reference = { id: string; name: string; description: string; sortOrder: number; isActive: boolean; isSystem: boolean; deviceCount: number };
type Device = {
  id: string; name: string; description: string; activeFromDate: string; inactiveFromDate: string | null; isArchived: boolean;
  zone: { id: string; name: string }; category: { id: string; name: string }; placementValidFrom: string;
  consumption: { validFromDate: string; mode: "HOURLY_AVERAGE" | "POWER_FACTOR"; consumptionPerHourKwh: string | null; nominalPowerKw: string | null; loadFactor: string | null; quantity: number; calculatedPerHourKwh: string; comment: string };
};
type Detail = { device: Device; consumptionVersions: Array<Record<string, string | number | null>>; placementVersions: Array<{ id: string; validFromDate: string; zone: { id: string; name: string }; category: { id: string; name: string }; comment: string }>; defaultSchedule: Array<{ weekday: number; hours: number[] }>; audit: Array<Record<string, string | null>> };

const fieldClass = "h-11 rounded-xl border border-[#d8e3e7] bg-white px-3 text-sm text-[#17374c] outline-none focus:border-[#1e7680]";
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const today = () => new Intl.DateTimeFormat("en-CA").format(new Date());

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Не удалось выполнить операцию");
  return body;
}

function formatKwh(value: string) {
  return Number(value).toLocaleString("ru-RU", { minimumFractionDigits: 3, maximumFractionDigits: 6 });
}

export function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [zones, setZones] = useState<Reference[]>([]);
  const [categories, setCategories] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [referenceKind, setReferenceKind] = useState<"zone" | "category">("zone");
  const [editReference, setEditReference] = useState<{ kind: "zones" | "categories"; value: Reference } | null>(null);
  const [mode, setMode] = useState<"HOURLY_AVERAGE" | "POWER_FACTOR">("HOURLY_AVERAGE");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [schedule, setSchedule] = useState<number[][]>(Array.from({ length: 7 }, () => []));
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [parameterMode, setParameterMode] = useState<"HOURLY_AVERAGE" | "POWER_FACTOR">("HOURLY_AVERAGE");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [deviceData, referenceData] = await Promise.all([
        fetch("/api/devices", { cache: "no-store" }).then(json<{ devices: Device[] }>),
        fetch("/api/references", { cache: "no-store" }).then(json<{ zones: Reference[]; categories: Reference[] }>),
      ]);
      setDevices(deviceData.devices); setZones(referenceData.zones); setCategories(referenceData.categories);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить приборы"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => devices.filter(device => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    return (!query || `${device.name} ${device.description}`.toLocaleLowerCase("ru-RU").includes(query)) && (!zoneFilter || device.zone.id === zoneFilter) && (!categoryFilter || device.category.id === categoryFilter);
  }), [devices, search, zoneFilter, categoryFilter]);

  async function openDevice(id: string) {
    setSelectedId(id); setDetailLoading(true); setError("");
    try {
      const data = await fetch(`/api/devices/${id}`, { cache: "no-store" }).then(json<Detail>);
      setDetail(data); setSchedule(data.defaultSchedule.map(day => day.hours));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось открыть прибор"); setSelectedId(null); }
    finally { setDetailLoading(false); }
  }

  async function refreshDetail() { if (selectedId) await openDevice(selectedId); }

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget; const data = new FormData(form);
    const body: Record<string, unknown> = { name: data.get("name"), description: data.get("description"), activeFromDate: data.get("activeFromDate"), zoneId: data.get("zoneId"), categoryId: data.get("categoryId"), mode, quantity: Number(data.get("quantity")), consumptionPerHourKwh: data.get("consumptionPerHourKwh"), nominalPowerKw: data.get("nominalPowerKw"), loadFactor: data.get("loadFactor") };
    try {
      await fetch("/api/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(json);
      setAddOpen(false); form.reset(); setNotice("Прибор создан вместе с первой версией параметров и размещения."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось создать прибор"); }
  }

  async function createReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = event.currentTarget; const data = new FormData(form);
    try {
      await fetch("/api/references", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: referenceKind, name: data.get("name"), description: data.get("description"), sortOrder: Number(data.get("sortOrder")) }) }).then(json);
      form.reset(); setNotice(referenceKind === "zone" ? "Зона добавлена." : "Категория добавлена."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить справочник"); }
  }

  async function updateReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editReference) return; setError(""); const data = new FormData(event.currentTarget);
    try {
      await fetch(`/api/references/${editReference.kind}/${editReference.value.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: data.get("name"), description: data.get("description"), sortOrder: Number(data.get("sortOrder")), isActive: editReference.value.isSystem || data.get("isActive") === "on" }) }).then(json);
      setEditReference(null); setNotice("Справочник обновлён."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось обновить справочник"); }
  }

  async function saveSchedule() {
    if (!selectedId) return; setError("");
    try {
      await fetch(`/api/devices/${selectedId}/default-schedule`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ schedule: schedule.map((hours, index) => ({ weekday: index + 1, hours })) }) }).then(json);
      setNotice("Недельное расписание сохранено."); await refreshDetail();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить расписание"); }
  }

  function toggleSchedule(day: number, hour: number) {
    setSchedule(current => current.map((hours, index) => index === day ? (hours.includes(hour) ? hours.filter(value => value !== hour) : [...hours, hour].sort((a, b) => a - b)) : hours));
  }

  async function addConsumptionVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId) return; setError(""); const form = event.currentTarget; const data = new FormData(form);
    try {
      await fetch(`/api/devices/${selectedId}/consumption-versions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ validFromDate: data.get("validFromDate"), mode: parameterMode, quantity: Number(data.get("quantity")), consumptionPerHourKwh: data.get("consumptionPerHourKwh"), nominalPowerKw: data.get("nominalPowerKw"), loadFactor: data.get("loadFactor"), comment: data.get("comment") }) }).then(json);
      form.reset(); setNotice("Новая версия параметров сохранена."); await refreshDetail();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось создать версию"); }
  }

  async function addPlacementVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId) return; setError(""); const form = event.currentTarget; const data = new FormData(form);
    try {
      await fetch(`/api/devices/${selectedId}/placement-versions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ validFromDate: data.get("validFromDate"), zoneId: data.get("zoneId"), categoryId: data.get("categoryId"), comment: data.get("comment") }) }).then(json);
      form.reset(); setNotice("Новая версия размещения сохранена."); await refreshDetail();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось создать версию размещения"); }
  }

  async function archiveDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId) return; setError(""); const data = new FormData(event.currentTarget);
    try {
      await fetch(`/api/devices/${selectedId}/archive`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inactiveFromDate: data.get("inactiveFromDate"), comment: data.get("comment") }) }).then(json);
      setArchiveOpen(false); setSelectedId(null); setDetail(null); setNotice("Прибор архивирован без удаления истории."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось архивировать прибор"); }
  }

  const activeZones = zones.filter(item => item.isActive);
  const activeCategories = categories.filter(item => item.isActive);

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap gap-2">
        <label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3 text-[#8497a2]" size={16} /><input className={`${fieldClass} w-full pl-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск прибора" /></label>
        <select className={fieldClass} value={zoneFilter} onChange={event => setZoneFilter(event.target.value)}><option value="">Все зоны</option>{zones.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select className={fieldClass} value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">Все категории</option>{categories.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      </div>
      <div className="flex gap-2"><Button variant="outline" className="rounded-xl" onClick={() => { setError(""); setReferencesOpen(true); }}><BookOpen size={16} />Зоны и категории</Button><Button className="rounded-xl bg-[#153d59] text-white" onClick={() => { setError(""); setAddOpen(true); }}><Plus size={16} />Добавить прибор</Button></div>
    </div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl border border-[#bfe2d6] bg-[#eef8f4] p-3 text-sm text-[#28745f]">{notice}</div>}
    <div className="surface-card overflow-hidden">
      {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-[#718590]"><Loader2 className="animate-spin" size={17} />Загрузка приборов…</div> : filtered.length === 0 ? <div className="p-10 text-center"><p className="font-medium text-[#17374c]">Приборов пока нет</p><p className="mt-1 text-sm text-[#718590]">Добавьте первый прибор с параметрами потребления.</p></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Прибор</TableHead><TableHead>Зона</TableHead><TableHead>Категория</TableHead><TableHead>Расход за час</TableHead><TableHead>Статус</TableHead><TableHead /></TableRow></TableHeader><TableBody>{filtered.map(device => <TableRow key={device.id}><TableCell><div><p className="font-medium text-[#17374c]">{device.name}</p><p className="max-w-64 truncate text-xs text-[#738792]">{device.description || `Работает с ${device.activeFromDate}`}</p></div></TableCell><TableCell><span className="flex items-center gap-1.5"><MapPin size={14} className="text-[#8497a2]" />{device.zone.name}</span></TableCell><TableCell>{device.category.name}</TableCell><TableCell>{formatKwh(device.consumption.calculatedPerHourKwh)} кВт⋅ч</TableCell><TableCell><Badge variant="outline" className={device.isArchived ? "border-[#d9dfe2] bg-[#f2f4f5] text-[#687982]" : "border-[#bfe2d6] bg-[#eef8f4] text-[#28745f]"}>{device.isArchived ? "Архив" : "Активен"}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Открыть ${device.name}`} onClick={() => void openDevice(device.id)}><ChevronRight size={17} /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
    </div>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-2xl"><DialogHeader><DialogTitle>Новый прибор</DialogTitle><DialogDescription>Первая версия параметров и размещения будет сохранена вместе с прибором.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={createDevice}>{error && <div role="alert" className="rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]">{error}</div>}<div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Название<input className={fieldClass} name="name" required placeholder="Льдогенератор" /></label><label className="grid gap-2 text-sm font-medium">Дата начала<input className={fieldClass} name="activeFromDate" type="date" required defaultValue={today()} /></label></div><label className="grid gap-2 text-sm font-medium">Описание<textarea name="description" className="min-h-20 rounded-xl border border-[#d8e3e7] p-3" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Зона<select className={fieldClass} name="zoneId" required>{activeZones.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="grid gap-2 text-sm font-medium">Категория<select className={fieldClass} name="categoryId" required>{activeCategories.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div><div className="grid gap-2 text-sm font-medium">Режим<select className={fieldClass} value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="HOURLY_AVERAGE">Среднее потребление за час</option><option value="POWER_FACTOR">Мощность × коэффициент загрузки</option></select></div><div className="grid gap-4 sm:grid-cols-3">{mode === "HOURLY_AVERAGE" ? <label className="grid gap-2 text-sm font-medium sm:col-span-2">Расход, кВт⋅ч/ч<input className={fieldClass} name="consumptionPerHourKwh" min="0.000001" step="0.000001" required /></label> : <><label className="grid gap-2 text-sm font-medium">Мощность, кВт<input className={fieldClass} name="nominalPowerKw" min="0.000001" step="0.000001" required /></label><label className="grid gap-2 text-sm font-medium">Коэффициент (0–1)<input className={fieldClass} name="loadFactor" min="0.000001" max="1" step="0.000001" required /></label></>}<label className="grid gap-2 text-sm font-medium">Количество<input className={fieldClass} name="quantity" type="number" min="1" step="1" defaultValue="1" required /></label></div><DialogFooter><Button variant="outline" type="button" onClick={() => setAddOpen(false)}>Отмена</Button><Button type="submit" className="bg-[#153d59] text-white">Создать прибор</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={referencesOpen} onOpenChange={setReferencesOpen}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-3xl"><DialogHeader><DialogTitle>Зоны и категории</DialogTitle><DialogDescription>Названия уникальны без учёта регистра и внешних пробелов. Используемые записи деактивируются без удаления истории.</DialogDescription></DialogHeader>{error && <div role="alert" className="rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]">{error}</div>}<div className="grid gap-5 md:grid-cols-2">{([['zones', zones], ['categories', categories]] as const).map(([kind, items]) => <section key={kind}><h3 className="mb-2 font-semibold text-[#17374c]">{kind === "zones" ? "Зоны" : "Категории"}</h3><div className="grid gap-2">{items.map(item => <button type="button" key={item.id} className="flex items-center justify-between rounded-xl border border-[#e1e9ec] p-3 text-left" onClick={() => setEditReference({ kind, value: item })}><span><span className="block text-sm font-medium">{item.name}</span><span className="text-xs text-[#738792]">{item.deviceCount} приборов · {item.isActive ? "активна" : "неактивна"}{item.isSystem ? " · системная" : ""}</span></span><Pencil size={15} /></button>)}</div></section>)}</div><form className="grid gap-3 rounded-xl bg-[#f3f7f8] p-4" onSubmit={createReference}><div className="grid gap-3 sm:grid-cols-4"><select className={fieldClass} value={referenceKind} onChange={event => setReferenceKind(event.target.value as typeof referenceKind)}><option value="zone">Новая зона</option><option value="category">Новая категория</option></select><input className={`${fieldClass} sm:col-span-2`} name="name" placeholder="Название" required /><input className={fieldClass} name="sortOrder" type="number" defaultValue="100" /></div><input className={fieldClass} name="description" placeholder="Описание" /><Button type="submit" className="justify-self-end bg-[#153d59] text-white"><CirclePlus size={16} />Добавить</Button></form></DialogContent></Dialog>

    <Dialog open={Boolean(editReference)} onOpenChange={open => !open && setEditReference(null)}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>Изменить справочник</DialogTitle><DialogDescription>Связанные приборы сохранят историческую ссылку.</DialogDescription></DialogHeader>{editReference && <form className="grid gap-4" onSubmit={updateReference}>{error && <div role="alert" className="rounded-xl border border-[#efc7bd] bg-[#fff4f1] p-3 text-sm text-[#8c3f2c]">{error}</div>}<label className="grid gap-2 text-sm font-medium">Название<input className={fieldClass} name="name" defaultValue={editReference.value.name} required /></label><label className="grid gap-2 text-sm font-medium">Описание<input className={fieldClass} name="description" defaultValue={editReference.value.description} /></label><label className="grid gap-2 text-sm font-medium">Порядок<input className={fieldClass} name="sortOrder" type="number" defaultValue={editReference.value.sortOrder} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={editReference.value.isActive} disabled={editReference.value.isSystem} />Активна{editReference.value.isSystem && " (системную категорию нельзя отключить)"}</label><DialogFooter><Button type="button" variant="outline" onClick={() => setEditReference(null)}>Отмена</Button><Button type="submit" className="bg-[#153d59] text-white">Сохранить</Button></DialogFooter></form>}</DialogContent></Dialog>

    <Dialog open={Boolean(selectedId)} onOpenChange={open => { if (!open) { setSelectedId(null); setDetail(null); } }}><DialogContent className="max-h-[94vh] overflow-y-auto rounded-2xl sm:max-w-5xl"><DialogHeader><DialogTitle>{detail?.device.name ?? "Прибор"}</DialogTitle><DialogDescription>{detail?.device.description || "Параметры, расписание и история прибора"}</DialogDescription></DialogHeader>{detailLoading ? <div className="p-10 text-center text-sm text-[#718590]">Загрузка…</div> : detail && <Tabs defaultValue="overview"><TabsList className="flex-wrap"><TabsTrigger value="overview">Обзор</TabsTrigger><TabsTrigger value="calendar">Календарь</TabsTrigger><TabsTrigger value="parameters">Параметры</TabsTrigger><TabsTrigger value="history">История</TabsTrigger></TabsList><TabsContent value="overview" className="grid gap-4 pt-4 sm:grid-cols-3"><div className="rounded-xl bg-[#f3f7f8] p-4"><MapPin size={17} /><p className="mt-3 text-xs text-[#738792]">Размещение</p><p className="font-medium">{detail.device.zone.name} · {detail.device.category.name}</p></div><div className="rounded-xl bg-[#f3f7f8] p-4"><Gauge size={17} /><p className="mt-3 text-xs text-[#738792]">Расход за час</p><p className="font-medium">{formatKwh(detail.device.consumption.calculatedPerHourKwh)} кВт⋅ч</p></div><div className="rounded-xl bg-[#f3f7f8] p-4"><Settings2 size={17} /><p className="mt-3 text-xs text-[#738792]">Активность</p><p className="font-medium">с {detail.device.activeFromDate}{detail.device.inactiveFromDate ? ` до ${detail.device.inactiveFromDate}` : ""}</p></div>{!detail.device.isArchived && <Button variant="outline" className="text-[#a54b39] sm:col-span-3 sm:justify-self-end" onClick={() => setArchiveOpen(true)}><Archive size={16} />Архивировать</Button>}</TabsContent><TabsContent value="calendar" className="pt-4"><p className="mb-3 text-sm text-[#718590]">Недельный шаблон. Нажмите час, чтобы включить или выключить его.</p><div className="overflow-x-auto"><div className="min-w-[780px] space-y-2">{days.map((day, dayIndex) => <div className="grid grid-cols-[48px_repeat(24,minmax(26px,1fr))] gap-1" key={day}><span className="py-1 text-sm font-medium">{day}</span>{Array.from({ length: 24 }, (_, hour) => <button type="button" key={hour} onClick={() => toggleSchedule(dayIndex, hour)} aria-label={`${day} ${hour}:00`} className={`h-8 rounded text-xs ${schedule[dayIndex]?.includes(hour) ? "bg-[#1e7680] text-white" : "bg-[#edf2f4] text-[#657c88]"}`}>{hour}</button>)}</div>)}</div></div><div className="mt-4 flex justify-end"><Button onClick={() => void saveSchedule()} className="bg-[#153d59] text-white">Сохранить шаблон</Button></div></TabsContent><TabsContent value="parameters" className="grid gap-5 pt-4 lg:grid-cols-2"><form className="grid gap-3 rounded-xl border border-[#e1e9ec] p-4" onSubmit={addConsumptionVersion}><h3 className="font-semibold">Новая версия потребления</h3><input className={fieldClass} name="validFromDate" type="date" required defaultValue={today()} /><select className={fieldClass} value={parameterMode} onChange={event => setParameterMode(event.target.value as typeof parameterMode)}><option value="HOURLY_AVERAGE">Средний расход</option><option value="POWER_FACTOR">Мощность × коэффициент</option></select>{parameterMode === "HOURLY_AVERAGE" ? <input className={fieldClass} name="consumptionPerHourKwh" min="0.000001" step="0.000001" placeholder="кВт⋅ч за час" required /> : <div className="grid grid-cols-2 gap-2"><input className={fieldClass} name="nominalPowerKw" min="0.000001" step="0.000001" placeholder="Мощность, кВт" required /><input className={fieldClass} name="loadFactor" min="0.000001" max="1" step="0.000001" placeholder="Коэффициент" required /></div>}<input className={fieldClass} name="quantity" type="number" min="1" defaultValue={detail.device.consumption.quantity} required /><input className={fieldClass} name="comment" placeholder="Комментарий к версии" required /><Button type="submit" className="bg-[#153d59] text-white">Добавить версию</Button></form><form className="grid gap-3 rounded-xl border border-[#e1e9ec] p-4" onSubmit={addPlacementVersion}><h3 className="font-semibold">Новая версия размещения</h3><input className={fieldClass} name="validFromDate" type="date" required defaultValue={today()} /><select className={fieldClass} name="zoneId" defaultValue={detail.device.zone.id}>{activeZones.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={fieldClass} name="categoryId" defaultValue={detail.device.category.id}>{activeCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className={fieldClass} name="comment" placeholder="Причина изменения" /><Button type="submit" className="bg-[#153d59] text-white">Добавить размещение</Button></form></TabsContent><TabsContent value="history" className="grid gap-5 pt-4 lg:grid-cols-2"><section><h3 className="mb-2 font-semibold">Потребление</h3><div className="space-y-2">{detail.consumptionVersions.map(version => <div key={String(version.id)} className="rounded-xl border p-3 text-sm"><b>{String(version.validFromDate)}</b> · {String(version.mode)} · количество {String(version.quantity)}<p className="text-[#718590]">{String(version.comment || "Без комментария")}</p></div>)}</div></section><section><h3 className="mb-2 font-semibold">Размещение</h3><div className="space-y-2">{detail.placementVersions.map(version => <div key={version.id} className="rounded-xl border p-3 text-sm"><b>{version.validFromDate}</b> · {version.zone.name} · {version.category.name}<p className="text-[#718590]">{version.comment || "Без комментария"}</p></div>)}</div></section></TabsContent></Tabs>}</DialogContent></Dialog>

    <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}><AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Архивировать прибор?</AlertDialogTitle><AlertDialogDescription>История параметров, размещения и календаря сохранится.</AlertDialogDescription></AlertDialogHeader><form id="archive-device-form" className="grid gap-3" onSubmit={archiveDevice}><input className={fieldClass} name="inactiveFromDate" type="date" min={detail?.device.activeFromDate} defaultValue={today()} required /><input className={fieldClass} name="comment" placeholder="Причина архивирования" required /></form><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction form="archive-device-form" type="submit" variant="destructive">Архивировать</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
