import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Fan,
  Gauge,
  Lightbulb,
  MapPin,
  Plus,
  Refrigerator,
  Settings2,
  Utensils,
  Zap,
} from "lucide-react";

import { EnergiaShell } from "@/components/energia-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const sections = {
  today: { title: "Сегодня, 15 сентября", eyebrow: "Оперативный контроль", description: "Расход и работа оборудования за текущий день." },
  calendar: { title: "Календарь", eyebrow: "Расписание оборудования", description: "Фактические часы работы приборов за неделю." },
  devices: { title: "Приборы", eyebrow: "Оборудование", description: "Активные приборы, зоны и расчётные параметры." },
  meter: { title: "Счётчик", eyebrow: "Фактические данные", description: "Показания основного электросчётчика и интервалы расхода." },
  reconciliation: { title: "Сверка", eyebrow: "Факт и расчёт", description: "Почасовые расхождения за 15 сентября 2026." },
  analytics: { title: "Аналитика", eyebrow: "Динамика потребления", description: "Структура нагрузки и сравнение периодов." },
  settings: { title: "Настройки", eyebrow: "Конфигурация Energia", description: "Параметры объекта, тарифы и справочники." },
} as const;

type Section = keyof typeof sections;

function PageHeader({ section }: { section: Section }) {
  const item = sections[section];
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-sm font-medium text-[#6e838e]">{item.eyebrow}</p>
        <h1 className="text-[clamp(2rem,4vw,3.15rem)] font-semibold tracking-[-0.055em] text-[#102d43]">{item.title}</h1>
        <p className="mt-2 text-[0.95rem] leading-6 text-[#627986]">{item.description}</p>
      </div>
      {section === "devices" && <Button className="rounded-xl bg-[#153d59] text-white"><Plus size={16} />Добавить прибор</Button>}
      {section === "meter" && <Button className="rounded-xl bg-[#153d59] text-white"><Plus size={16} />Добавить показание</Button>}
    </div>
  );
}

const summary = [
  { label: "Факт", value: "82,4", unit: "кВт⋅ч", icon: Zap },
  { label: "По приборам", value: "76,1", unit: "кВт⋅ч", icon: Lightbulb },
  { label: "Разница", value: "+6,3", unit: "кВт⋅ч", icon: AlertTriangle },
  { label: "Покрытие", value: "100", unit: "%", icon: CheckCircle2 },
];

function TodayPage() {
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{summary.map(({ label, value, unit, icon: Icon }) => <div className="surface-card p-5" key={label}><Icon size={18} className="text-[#1e7680]" /><p className="eyebrow mt-5">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#102d43]">{value} <span className="text-sm font-medium text-[#657d89]">{unit}</span></p></div>)}</div><div className="surface-card mt-4 overflow-hidden"><div className="flex items-center justify-between p-5 sm:p-6"><div><h2 className="section-title">Работа оборудования</h2><p className="mt-1 text-sm text-[#738792]">Расписание материализовано для 12 приборов</p></div><Badge className="bg-[#e7f6f1] text-[#28745f] hover:bg-[#e7f6f1]">Заполнен</Badge></div><Table><TableHeader><TableRow><TableHead>Прибор</TableHead><TableHead>Зона</TableHead><TableHead>Часы работы</TableHead><TableHead className="text-right">Потребление</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell className="font-medium">Холодильник №1</TableCell><TableCell>Кухня</TableCell><TableCell>00:00–24:00</TableCell><TableCell className="text-right">4,8 кВт⋅ч</TableCell></TableRow><TableRow><TableCell className="font-medium">Вентиляция</TableCell><TableCell>Зал</TableCell><TableCell>10:00–23:00</TableCell><TableCell className="text-right">13,0 кВт⋅ч</TableCell></TableRow><TableRow><TableCell className="font-medium">Посудомойка</TableCell><TableCell>Кухня</TableCell><TableCell>11:00–17:00</TableCell><TableCell className="text-right">12,0 кВт⋅ч</TableCell></TableRow></TableBody></Table></div></>;
}

function CalendarPage() {
  const days = ["Пн 14", "Вт 15", "Ср 16", "Чт 17", "Пт 18", "Сб 19", "Вс 20"];
  const devices = ["Холодильник №1", "Вентиляция", "Посудомойка", "Освещение зала"];
  return <div className="surface-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6"><div><h2 className="section-title">14–20 сентября</h2><p className="mt-1 text-sm text-[#738792]">Отмечены часы фактической работы</p></div><Button variant="outline" className="rounded-xl"><CalendarDays size={16} />Выбрать неделю</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse"><thead><tr className="border-y bg-[#f7fafb]"><th className="px-5 py-3 text-left text-xs font-semibold text-[#687e8a]">Прибор</th>{days.map(day => <th className="px-3 py-3 text-center text-xs font-semibold text-[#687e8a]" key={day}>{day}</th>)}</tr></thead><tbody>{devices.map((device, row) => <tr className="border-b" key={device}><td className="px-5 py-4 text-sm font-medium text-[#17374c]">{device}</td>{days.map((day, col) => <td className="px-3 py-4 text-center" key={day}><span className={`inline-flex min-w-14 justify-center rounded-lg px-2 py-1 text-xs font-medium ${(row + col) % 5 === 0 ? "bg-[#fff0d4] text-[#96620b]" : "bg-[#e7f3f2] text-[#276d68]"}`}>{(row + col) % 5 === 0 ? "6 ч" : row === 0 ? "24 ч" : "13 ч"}</span></td>)}</tr>)}</tbody></table></div></div>;
}

function DevicesPage() {
  const devices = [{ name: "Холодильник №1", icon: Refrigerator, zone: "Кухня", category: "Холодильники", usage: "0,20 кВт⋅ч/ч", state: "Активен" },{ name: "Вентиляция", icon: Fan, zone: "Зал", category: "Вентиляция", usage: "1,00 кВт⋅ч/ч", state: "Активен" },{ name: "Посудомойка", icon: Utensils, zone: "Кухня", category: "Кухонное оборудование", usage: "2,00 кВт⋅ч/ч", state: "Активен" },{ name: "Освещение зала", icon: Lightbulb, zone: "Зал", category: "Освещение", usage: "0,84 кВт⋅ч/ч", state: "Активен" }];
  return <div className="surface-card overflow-hidden"><Table><TableHeader><TableRow><TableHead>Прибор</TableHead><TableHead>Зона</TableHead><TableHead>Категория</TableHead><TableHead>Расход</TableHead><TableHead>Статус</TableHead><TableHead /></TableRow></TableHeader><TableBody>{devices.map(({ name, icon: Icon, zone, category, usage, state }) => <TableRow key={name}><TableCell><span className="flex items-center gap-3 font-medium text-[#17374c]"><i className="grid size-9 place-items-center rounded-xl bg-[#eaf2f4] text-[#24516a]"><Icon size={17} /></i>{name}</span></TableCell><TableCell><span className="flex items-center gap-1.5"><MapPin size={14} className="text-[#8497a2]" />{zone}</span></TableCell><TableCell>{category}</TableCell><TableCell>{usage}</TableCell><TableCell><Badge variant="outline" className="border-[#bfe2d6] bg-[#eef8f4] text-[#28745f]">{state}</Badge></TableCell><TableCell><ChevronRight size={17} className="text-[#8da0aa]" /></TableCell></TableRow>)}</TableBody></Table></div>;
}

function MeterPage() {
  const rows = [["15.09.2026", "15:00", "15 842,200", "—"], ["15.09.2026", "10:00", "15 810,400", "31,800 / 5 часов"], ["15.09.2026", "00:00", "15 748,000", "62,400 / 10 часов"], ["14.09.2026", "00:00", "15 628,000", "120,000 / 24 часа"]];
  return <><div className="grid gap-4 sm:grid-cols-3"><div className="surface-card p-5"><Gauge size={18} className="text-[#1e7680]" /><p className="eyebrow mt-4">Последнее показание</p><p className="mt-2 text-2xl font-semibold text-[#14364b]">15 842,200</p><p className="mt-1 text-sm text-[#718590]">15 сентября, 15:00</p></div><div className="surface-card p-5"><Activity size={18} className="text-[#b57a17]" /><p className="eyebrow mt-4">Расход за сегодня</p><p className="mt-2 text-2xl font-semibold text-[#14364b]">82,4 кВт⋅ч</p><p className="mt-1 text-sm text-[#718590]">Покрытие 100 %</p></div><div className="surface-card p-5"><CircleGauge size={18} className="text-[#315f7c]" /><p className="eyebrow mt-4">Основной счётчик</p><p className="mt-2 text-2xl font-semibold text-[#14364b]">Бар №1</p><p className="mt-1 text-sm text-[#718590]">Активен</p></div></div><div className="surface-card mt-4 overflow-hidden"><Table><TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Время</TableHead><TableHead>Показание, кВт⋅ч</TableHead><TableHead>Расход до следующего</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={`${row[0]}-${row[1]}`}>{row.map((cell, index) => <TableCell className={index === 2 ? "font-medium text-[#17374c]" : ""} key={cell}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table></div></>;
}

function ReconciliationPage() {
  const rows = [{ hour: "10:00–11:00", actual: "6,36", quality: "Интерполяция", devices: "4,20", delta: "+2,16", status: "Нераспределено" },{ hour: "11:00–12:00", actual: "6,36", quality: "Интерполяция", devices: "7,10", delta: "−0,74", status: "Модель завышена" },{ hour: "12:00–13:00", actual: "7,50", quality: "Ручное", devices: "5,20", delta: "+2,30", status: "Нераспределено" },{ hour: "13:00–14:00", actual: "6,08", quality: "Интерполяция", devices: "5,90", delta: "+0,18", status: "Норма" }];
  return <><div className="grid gap-4 sm:grid-cols-3"><div className="surface-card p-5"><p className="eyebrow">Факт</p><p className="mt-2 text-3xl font-semibold text-[#14364b]">82,4 <span className="text-sm">кВт⋅ч</span></p></div><div className="surface-card p-5"><p className="eyebrow">По приборам</p><p className="mt-2 text-3xl font-semibold text-[#14364b]">76,1 <span className="text-sm">кВт⋅ч</span></p></div><div className="surface-card p-5"><p className="eyebrow">Расхождение</p><p className="mt-2 text-3xl font-semibold text-[#a66b0a]">+7,6 %</p></div></div><div className="surface-card mt-4 overflow-hidden"><Table><TableHeader><TableRow><TableHead>Час</TableHead><TableHead>Факт</TableHead><TableHead>Качество</TableHead><TableHead>Приборы</TableHead><TableHead>Разница</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.hour}><TableCell className="font-medium">{row.hour}</TableCell><TableCell>{row.actual}</TableCell><TableCell>{row.quality}</TableCell><TableCell>{row.devices}</TableCell><TableCell className={row.delta.startsWith("−") ? "text-[#315f7c]" : "text-[#9a6208]"}>{row.delta}</TableCell><TableCell><Badge variant="outline" className={row.status === "Норма" ? "border-[#bfe2d6] bg-[#eef8f4] text-[#28745f]" : "border-[#f1d49f] bg-[#fff7e7] text-[#90600d]"}>{row.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div></>;
}

function AnalyticsPage() {
  const bars = [42, 55, 48, 67, 76, 84, 60, 72, 58, 91, 74, 66];
  return <Tabs defaultValue="trend"><TabsList className="mb-4 h-auto flex-wrap rounded-xl bg-[#e7eef0] p-1"><TabsTrigger value="trend">Динамика</TabsTrigger><TabsTrigger value="categories">Категории</TabsTrigger><TabsTrigger value="zones">Зоны</TabsTrigger><TabsTrigger value="compare">Сравнение</TabsTrigger></TabsList><TabsContent value="trend"><div className="surface-card p-5 sm:p-6"><div className="flex items-start justify-between"><div><h2 className="section-title">Потребление по дням</h2><p className="mt-1 text-sm text-[#738792]">1–30 сентября 2026</p></div><Badge variant="outline">3 820 кВт⋅ч</Badge></div><div className="mt-8 flex h-64 items-end gap-2 border-b border-[#dce6e9] px-1">{bars.map((height, index) => <div className="group relative flex-1" key={index}><div className="rounded-t-lg bg-[#1e7680] transition hover:bg-[#d49424]" style={{ height: `${height}%` }} /><span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[11px] text-[#81949e]">{index * 3 + 1}</span></div>)}</div><div className="mt-12 grid gap-4 sm:grid-cols-3"><div><p className="eyebrow">Максимальный день</p><p className="mt-2 font-semibold text-[#17374c]">25 сентября · 171 кВт⋅ч</p></div><div><p className="eyebrow">Минимальный день</p><p className="mt-2 font-semibold text-[#17374c]">7 сентября · 118 кВт⋅ч</p></div><div><p className="eyebrow">Среднее</p><p className="mt-2 font-semibold text-[#17374c]">127,3 кВт⋅ч/день</p></div></div></div></TabsContent><TabsContent value="categories"><Breakdown title="Категории" items={[["Холодильники", 28], ["Кухня", 24], ["Вентиляция", 15], ["Освещение", 12]]} /></TabsContent><TabsContent value="zones"><Breakdown title="Зоны" items={[["Кухня", 46], ["Зал", 31], ["Барная стойка", 14], ["Склад", 9]]} /></TabsContent><TabsContent value="compare"><div className="surface-card p-6"><h2 className="section-title">Сентябрь к августу</h2><p className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-[#102d43]">+4,2 %</p><p className="mt-2 text-sm text-[#6f838e]">Фактическое потребление выросло на 154 кВт⋅ч</p></div></TabsContent></Tabs>;
}

function Breakdown({ title, items }: { title: string; items: (string | number)[][] }) { return <div className="surface-card p-6"><h2 className="section-title">{title}</h2><div className="mt-6 grid gap-5">{items.map(([name, value]) => <div key={String(name)}><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-[#375567]">{name}</span><span className="font-semibold text-[#17374c]">{value} %</span></div><Progress value={Number(value)} className="h-2 bg-[#e5edef] [&>div]:bg-[#1e7680]" /></div>)}</div></div>; }

function SettingsPage() {
  const cards = [{ title: "Параметры объекта", detail: "Основной бар · Москва · RUB", icon: Settings2 }, { title: "Зоны", detail: "4 активные зоны", icon: MapPin }, { title: "Категории", detail: "6 категорий оборудования", icon: Lightbulb }, { title: "Тарифы", detail: "3,30 ₽/кВт⋅ч с 01.09.2026", icon: Zap }, { title: "Пересчёт", detail: "Последний запуск сегодня в 14:32", icon: Activity }, { title: "Журнал изменений", detail: "24 записи за сентябрь", icon: Clock3 }];
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(({ title, detail, icon: Icon }) => <button className="surface-card group flex items-center gap-4 p-5 text-left transition hover:-translate-y-0.5 hover:border-[#cbdce2]" key={title} type="button"><i className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e9f1f3] text-[#24516a]"><Icon size={19} /></i><span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-[#17374c]">{title}</strong><span className="mt-1 block text-sm text-[#738792]">{detail}</span></span><ChevronRight size={17} className="text-[#96a7af] transition group-hover:translate-x-1" /></button>)}</div>;
}

function SectionContent({ section }: { section: Section }) {
  if (section === "today") return <TodayPage />;
  if (section === "calendar") return <CalendarPage />;
  if (section === "devices") return <DevicesPage />;
  if (section === "meter") return <MeterPage />;
  if (section === "reconciliation") return <ReconciliationPage />;
  if (section === "analytics") return <AnalyticsPage />;
  return <SettingsPage />;
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in sections)) notFound();
  const validSection = section as Section;
  return <EnergiaShell><main className="mx-auto w-full max-w-[1560px] px-4 pb-10 pt-6 sm:px-7 lg:px-9 lg:pt-8"><PageHeader section={validSection} /><SectionContent section={validSection} /></main></EnergiaShell>;
}
