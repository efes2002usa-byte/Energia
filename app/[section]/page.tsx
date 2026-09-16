import { notFound } from "next/navigation";

import { EnergiaShell } from "@/components/energia-shell";
import { SectionContent, type Section } from "@/components/section-content";

const sections = {
  today: { title: "Сегодня, 15 сентября", eyebrow: "Оперативный контроль", description: "Расход и работа оборудования за текущий день." },
  calendar: { title: "Календарь", eyebrow: "Расписание оборудования", description: "Фактические часы работы приборов за неделю." },
  devices: { title: "Приборы", eyebrow: "Оборудование", description: "Активные приборы, зоны и расчётные параметры." },
  meter: { title: "Счётчик", eyebrow: "Фактические данные", description: "Показания основного электросчётчика и интервалы расхода." },
  reconciliation: { title: "Сверка", eyebrow: "Факт и расчёт", description: "Почасовые расхождения за 15 сентября 2026." },
  analytics: { title: "Аналитика", eyebrow: "Динамика потребления", description: "Структура нагрузки и сравнение периодов." },
  settings: { title: "Настройки", eyebrow: "Конфигурация Energia", description: "Параметры объекта, тарифы и справочники." },
} as const;

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in sections)) notFound();
  const validSection = section as Section;
  const item = sections[validSection];

  return (
    <EnergiaShell>
      <main className="mx-auto w-full max-w-[1560px] px-4 pb-10 pt-6 sm:px-7 lg:px-9 lg:pt-8">
        <div className="mb-7">
          <p className="mb-2 text-sm font-medium text-[#6e838e]">{item.eyebrow}</p>
          <h1 className="text-[clamp(2rem,4vw,3.15rem)] font-semibold tracking-[-0.055em] text-[#102d43]">{item.title}</h1>
          <p className="mt-2 text-[0.95rem] leading-6 text-[#627986]">{item.description}</p>
        </div>
        <SectionContent section={validSection} />
      </main>
    </EnergiaShell>
  );
}
