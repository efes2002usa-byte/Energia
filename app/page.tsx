"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bolt,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  MoreHorizontal,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const monthData = [
  { day: "01 сен", actual: 112, model: 103 },
  { day: "04 сен", actual: 128, model: 119 },
  { day: "07 сен", actual: 118, model: 114 },
  { day: "10 сен", actual: 142, model: 126 },
  { day: "13 сен", actual: 163, model: 131 },
  { day: "16 сен", actual: 139, model: 128 },
  { day: "19 сен", actual: 151, model: 140 },
  { day: "22 сен", actual: 129, model: 127 },
  { day: "25 сен", actual: 171, model: 149 },
  { day: "28 сен", actual: 138, model: 132 },
  { day: "30 сен", actual: 146, model: 136 },
];

const weekData = [
  { day: "Пн", actual: 129, model: 123 },
  { day: "Вт", actual: 147, model: 132 },
  { day: "Ср", actual: 138, model: 136 },
  { day: "Чт", actual: 156, model: 141 },
  { day: "Пт", actual: 179, model: 151 },
  { day: "Сб", actual: 188, model: 166 },
  { day: "Вс", actual: 144, model: 138 },
];

const navItems = [
  { label: "Главная", icon: LayoutDashboard, href: "/", active: true },
  { label: "Сегодня", icon: Clock3, href: "/today" },
  { label: "Календарь", icon: CalendarDays, href: "/calendar" },
  { label: "Приборы", icon: Lightbulb, href: "/devices" },
  { label: "Счётчик", icon: Gauge, href: "/meter" },
  { label: "Сверка", icon: SlidersHorizontal, href: "/reconciliation" },
  { label: "Аналитика", icon: BarChart3, href: "/analytics" },
];

const metrics = [
  { label: "Фактический расход", value: "3 820", unit: "кВт⋅ч", detail: "12 420 ₽", trend: "+4,2 % к августу", icon: Zap, tone: "blue" },
  { label: "По приборам", value: "3 410", unit: "кВт⋅ч", detail: "11 087 ₽", trend: "89,3 % объяснено", icon: Wrench, tone: "teal" },
  { label: "Нераспределено", value: "+410", unit: "кВт⋅ч", detail: "+1 333 ₽", trend: "+10,7 % от факта", icon: AlertTriangle, tone: "amber" },
];

const categories = [
  { name: "Холодильники", value: 28, color: "#163b5c" },
  { name: "Кухня", value: 24, color: "#1e7680" },
  { name: "Вентиляция", value: 15, color: "#d49a33" },
  { name: "Освещение", value: 12, color: "#7d91a2" },
  { name: "Прочее", value: 21, color: "#dce4e8" },
];

const alerts = [
  { date: "14 сентября", title: "Расхождение выше допуска", detail: "+23 % · 31,4 кВт⋅ч не распределено", tone: "critical" },
  { date: "18 сентября", title: "Неполные данные счётчика", detail: "Нет факта для 6 часов", tone: "warning" },
  { date: "26 сентября", title: "Расчётная модель завышена", detail: "−8 % · проверьте расписание приборов", tone: "info" },
];

function MetricCard({ metric }: { metric: (typeof metrics)[number] }) {
  const Icon = metric.icon;
  return (
    <button className="metric-card group text-left" type="button">
      <div className={`metric-icon metric-icon-${metric.tone}`}><Icon aria-hidden="true" size={18} /></div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{metric.label}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-[2rem] font-semibold tracking-[-0.05em] text-[#0c263a]">{metric.value}</span>
            <span className="text-sm font-medium text-[#597080]">{metric.unit}</span>
          </p>
        </div>
        <Activity className="mb-2 text-[#9aabb6] transition group-hover:text-[#173f5f]" size={18} />
      </div>
      <Separator className="my-4 bg-[#e7edf0]" />
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-[#2d485b]">{metric.detail}</span>
        <span className={metric.tone === "amber" ? "text-[#a66b0a]" : "text-[#637b89]"}>{metric.trend}</span>
      </div>
    </button>
  );
}

function Donut() {
  return (
    <div className="relative grid size-40 shrink-0 place-items-center rounded-full" style={{ background: "conic-gradient(#163b5c 0 28%, #1e7680 28% 52%, #d49a33 52% 67%, #7d91a2 67% 79%, #dce4e8 79% 100%)" }} aria-label="Структура потребления по категориям">
      <div className="grid size-[104px] place-items-center rounded-full bg-white text-center shadow-inner">
        <div><p className="text-2xl font-semibold tracking-[-0.05em] text-[#102d43]">3 410</p><p className="text-xs text-[#6a7f8c]">кВт⋅ч по модели</p></div>
      </div>
    </div>
  );
}

function DashboardChart({ period }: { period: "month" | "week" }) {
  const data = period === "month" ? monthData : weekData;
  return (
    <div className="h-[290px] w-full" aria-label="График фактического и расчётного потребления">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 4, bottom: 0, left: -20 }}>
          <defs><linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#173f5f" stopOpacity={0.22} /><stop offset="100%" stopColor="#173f5f" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#e6ecef" strokeDasharray="3 5" />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#748996", fontSize: 12 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8a9aa4", fontSize: 12 }} domain={[80, 200]} />
          <Tooltip cursor={{ stroke: "#97aab6", strokeDasharray: "3 4" }} contentStyle={{ border: "1px solid #dfe8ec", borderRadius: 12, boxShadow: "0 14px 36px rgba(16,45,67,.12)", fontSize: 13 }} formatter={(value, name) => [`${Number(value).toLocaleString("ru-RU")} кВт⋅ч`, name === "actual" ? "Факт" : "Расчёт"]} />
          <Area type="monotone" dataKey="actual" stroke="#173f5f" strokeWidth={3} fill="url(#actualFill)" activeDot={{ r: 5, fill: "#173f5f" }} />
          <Area type="monotone" dataKey="model" stroke="#d49424" strokeWidth={2.5} strokeDasharray="6 5" fill="transparent" activeDot={{ r: 4, fill: "#d49424" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Home() {
  const [period, setPeriod] = useState<"month" | "week">("month");
  const periodLabel = useMemo(() => period === "month" ? "1–30 сентября 2026" : "14–20 сентября 2026", [period]);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-none">
        <SidebarHeader className="px-4 pb-4 pt-5">
          <div className="flex items-center gap-3 px-2">
            <div className="brand-mark"><Bolt aria-hidden="true" size={19} fill="currentColor" /></div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="text-[1.06rem] font-semibold tracking-[-0.035em] text-white">Energia</p><p className="truncate text-xs text-white/48">Основной бар</p></div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[0.68rem] uppercase tracking-[0.14em] text-white/35">Управление</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild isActive={item.active} tooltip={item.label} className="h-10 rounded-xl px-3 text-[0.9rem] text-white/64 hover:bg-white/8 hover:text-white data-[active=true]:bg-[#f0b84c] data-[active=true]:font-semibold data-[active=true]:text-[#10283b]">
                      <a href={item.href}><item.icon aria-hidden="true" size={18} /><span>{item.label}</span></a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-3">
            <SidebarGroupLabel className="px-3 text-[0.68rem] uppercase tracking-[0.14em] text-white/35">Система</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Настройки" className="h-10 rounded-xl px-3 text-[0.9rem] text-white/64 hover:bg-white/8 hover:text-white"><a href="/settings"><Settings aria-hidden="true" size={18} /><span>Настройки</span></a></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-4 pb-5">
          <div className="rounded-2xl border border-white/8 bg-white/[0.045] p-3 group-data-[collapsible=icon]:p-2"><div className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d9edf0] text-sm font-semibold text-[#16404f]">A</div><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium text-white">Администратор</p><p className="truncate text-xs text-white/42">Данные актуальны</p></div><ChevronDown className="ml-auto text-white/35 group-data-[collapsible=icon]:hidden" size={15} /></div></div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#f3f7f8]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dfe8eb] bg-[#f8fbfb]/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex items-center gap-3"><SidebarTrigger className="size-9 rounded-xl border border-[#dbe5e9] bg-white text-[#17384e] shadow-sm hover:bg-[#edf4f5]" /><div className="hidden h-7 w-px bg-[#dbe4e8] sm:block" /><div className="hidden sm:block"><p className="text-sm font-medium text-[#19374b]">Основной бар</p><p className="text-xs text-[#718590]">Москва · UTC+3</p></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full border border-[#dce8e8] bg-white px-3 py-2 text-xs font-medium text-[#48616f] shadow-sm md:flex"><span className="size-2 rounded-full bg-[#2ca381] shadow-[0_0_0_4px_rgba(44,163,129,.1)]" />Пересчитано в 14:32</div><Button variant="outline" size="icon" className="rounded-xl border-[#dbe5e9] bg-white text-[#4b6573]"><MoreHorizontal aria-hidden="true" size={18} /><span className="sr-only">Дополнительные действия</span></Button></div>
        </header>

        <main className="mx-auto w-full max-w-[1560px] px-4 pb-10 pt-6 sm:px-7 lg:px-9 lg:pt-8">
          <section className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#6e838e]"><Sparkles size={15} className="text-[#c68b22]" />Обзор энергопотребления</div><h1 className="text-[clamp(2rem,4vw,3.15rem)] font-semibold tracking-[-0.055em] text-[#102d43]">Главная</h1><p className="mt-2 max-w-xl text-[0.95rem] leading-6 text-[#627986]">Факт, расчётная модель и расхождения за выбранный период.</p></div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#dce7ea] bg-white p-2 shadow-[0_9px_30px_rgba(22,57,78,.06)]"><div className="flex rounded-xl bg-[#eef3f4] p-1"><button className={`period-button ${period === "week" ? "period-button-active" : ""}`} onClick={() => setPeriod("week")} type="button">Неделя</button><button className={`period-button ${period === "month" ? "period-button-active" : ""}`} onClick={() => setPeriod("month")} type="button">Месяц</button></div><button className="flex h-10 min-w-[190px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-[#29475a] hover:bg-[#f3f7f8]" type="button"><CalendarDays size={16} className="text-[#67808e]" />{periodLabel}<ChevronDown size={14} className="ml-auto text-[#8597a1]" /></button></div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(330px,.88fr)]">
            <div className="surface-card min-w-0"><div className="flex flex-col justify-between gap-4 border-b border-[#e6edef] px-5 py-5 sm:flex-row sm:items-start sm:px-6"><div><h2 className="section-title">Факт и расчёт</h2><p className="mt-1 text-sm text-[#738792]">Суточное потребление, кВт⋅ч</p></div><div className="flex items-center gap-4 text-xs font-medium text-[#617784]"><span className="flex items-center gap-2"><i className="block h-[3px] w-7 rounded-full bg-[#173f5f]" />Факт</span><span className="flex items-center gap-2"><i className="block h-0 w-7 border-t-2 border-dashed border-[#d49424]" />Расчёт</span></div></div><div className="px-3 pb-4 pt-3 sm:px-5"><DashboardChart period={period} /></div></div>

            <div className="surface-card flex flex-col"><div className="flex items-start justify-between px-5 pb-3 pt-5 sm:px-6"><div><h2 className="section-title">Качество данных</h2><p className="mt-1 text-sm text-[#738792]">Покрытие фактическими данными</p></div><Badge variant="outline" className="rounded-full border-[#bee3d6] bg-[#eef9f5] px-2.5 py-1 text-[#24765f]">Хорошее</Badge></div><div className="px-5 py-4 sm:px-6"><div className="flex items-end justify-between"><p className="text-[2.65rem] font-semibold tracking-[-0.06em] text-[#102d43]">91,7<span className="ml-1 text-xl text-[#506a78]">%</span></p><p className="pb-2 text-sm text-[#6e828e]">660 из 720 часов</p></div><Progress value={91.7} className="mt-3 h-2 bg-[#e5edef] [&>div]:bg-[#2b937b]" /></div><Separator className="bg-[#e7edef]" /><div className="grid flex-1 grid-cols-2 gap-px bg-[#e7edef]"><div className="bg-white p-5"><TrendingUp size={18} className="mb-3 text-[#2e806f]" /><p className="eyebrow">Максимальный час</p><p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#15344a]">18,4 кВт⋅ч</p><p className="mt-1 text-xs text-[#748792]">25 сен, 19:00</p></div><div className="bg-white p-5"><Activity size={18} className="mb-3 text-[#b67b18]" /><p className="eyebrow">Среднее в день</p><p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#15344a]">127,3 кВт⋅ч</p><p className="mt-1 text-xs text-[#748792]">+5,1 к августу</p></div></div></div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
            <div className="surface-card p-5 sm:p-6"><div className="flex items-start justify-between"><div><h2 className="section-title">Структура по категориям</h2><p className="mt-1 text-sm text-[#738792]">Доля расчётного потребления</p></div><Button variant="ghost" size="sm" className="rounded-xl text-[#506b7b]">Подробнее</Button></div><div className="mt-6 flex flex-col items-center gap-7 sm:flex-row"><Donut /><div className="grid w-full gap-3">{categories.map((category) => <div className="flex items-center justify-between gap-4" key={category.name}><span className="flex items-center gap-2.5 text-sm text-[#405b6b]"><i className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} />{category.name}</span><span className="text-sm font-semibold text-[#19394f]">{category.value} %</span></div>)}</div></div></div>

            <div className="surface-card overflow-hidden"><div className="flex items-start justify-between px-5 pb-4 pt-5 sm:px-6"><div><h2 className="section-title">Требуют внимания</h2><p className="mt-1 text-sm text-[#738792]">Отклонения и неполные данные</p></div><Badge className="rounded-full bg-[#fff0d4] px-2.5 py-1 text-[#925e09] hover:bg-[#fff0d4]">3 события</Badge></div><div className="divide-y divide-[#e9eef0] border-y border-[#e9eef0]">{alerts.map((alert) => <button className="alert-row group" key={alert.date} type="button"><div className={`alert-symbol alert-symbol-${alert.tone}`}>{alert.tone === "info" ? <TrendingDown size={17} /> : <AlertTriangle size={17} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="font-medium text-[#15354b]">{alert.title}</p><span className="text-xs text-[#8799a3]">{alert.date}</span></div><p className="mt-1 text-sm text-[#687f8c]">{alert.detail}</p></div><ChevronDown className="-rotate-90 text-[#9aabb4] transition-transform group-hover:translate-x-1" size={17} /></button>)}</div><div className="flex items-center justify-between px-5 py-4 sm:px-6"><span className="flex items-center gap-2 text-xs text-[#708590]"><CheckCircle2 size={15} className="text-[#348a73]" />27 дней без критичных событий</span><Button variant="outline" size="sm" className="rounded-xl border-[#d9e4e8] text-[#284b60]">Открыть сверку</Button></div></div>
          </section>

          <footer className="mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-[#dfe8eb] bg-white/65 px-5 py-4 text-xs text-[#71858f] sm:flex-row sm:items-center"><span className="flex items-center gap-2"><ClipboardCheck size={15} className="text-[#2c8871]" />Последний успешный пересчёт: 15 сентября 2026, 14:32</span><span>Тариф: 3,30 ₽/кВт⋅ч · Допуск: ±5 % и ±1 кВт⋅ч</span></footer>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
