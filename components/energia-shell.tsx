/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bolt,
  CalendarDays,
  ChevronDown,
  Clock3,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  MoreHorizontal,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const navigation = [
  { label: "Главная", icon: LayoutDashboard, href: "/" },
  { label: "Сегодня", icon: Clock3, href: "/today" },
  { label: "Календарь", icon: CalendarDays, href: "/calendar" },
  { label: "Приборы", icon: Lightbulb, href: "/devices" },
  { label: "Счётчик", icon: Gauge, href: "/meter" },
  { label: "Сверка", icon: SlidersHorizontal, href: "/reconciliation" },
  { label: "Аналитика", icon: BarChart3, href: "/analytics" },
];

export function EnergiaShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-none">
        <SidebarHeader className="px-4 pb-4 pt-5">
          <a href="/" className="flex items-center gap-3 px-2" aria-label="Energia — главная">
            <div className="brand-mark"><Bolt aria-hidden="true" size={19} fill="currentColor" /></div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-[1.06rem] font-semibold tracking-[-0.035em] text-white">Energia</p>
              <p className="truncate text-xs text-white/48">Основной бар</p>
            </div>
          </a>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[0.68rem] uppercase tracking-[0.14em] text-white/35">Управление</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label} className="h-10 rounded-xl px-3 text-[0.9rem] text-white/64 hover:bg-white/8 hover:text-white data-[active=true]:bg-[#f0b84c] data-[active=true]:font-semibold data-[active=true]:text-[#10283b]">
                      <a href={item.href}><item.icon aria-hidden="true" size={18} /><span>{item.label}</span></a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-3">
            <SidebarGroupLabel className="px-3 text-[0.68rem] uppercase tracking-[0.14em] text-white/35">Система</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/operations"} tooltip="Операции" className="h-10 rounded-xl px-3 text-[0.9rem] text-white/64 hover:bg-white/8 hover:text-white data-[active=true]:bg-[#f0b84c] data-[active=true]:font-semibold data-[active=true]:text-[#10283b]">
                    <a href="/operations"><Activity aria-hidden="true" size={18} /><span>Операции</span></a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/settings"} tooltip="Настройки" className="h-10 rounded-xl px-3 text-[0.9rem] text-white/64 hover:bg-white/8 hover:text-white data-[active=true]:bg-[#f0b84c] data-[active=true]:font-semibold data-[active=true]:text-[#10283b]">
                    <a href="/settings"><Settings aria-hidden="true" size={18} /><span>Настройки</span></a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-4 pb-5">
          <a href="/settings" className="block rounded-2xl border border-white/8 bg-white/[0.045] p-3 transition hover:bg-white/[0.08] group-data-[collapsible=icon]:p-2" aria-label="Открыть настройки профиля">
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d9edf0] text-sm font-semibold text-[#16404f]">A</div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium text-white">Администратор</p><p className="truncate text-xs text-white/42">Данные актуальны</p></div>
              <ChevronDown className="ml-auto text-white/35 group-data-[collapsible=icon]:hidden" size={15} />
            </div>
          </a>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#f3f7f8]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dfe8eb] bg-[#f8fbfb]/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="size-9 rounded-xl border border-[#dbe5e9] bg-white text-[#17384e] shadow-sm hover:bg-[#edf4f5]" />
            <div className="hidden h-7 w-px bg-[#dbe4e8] sm:block" />
            <div className="hidden sm:block"><p className="text-sm font-medium text-[#19374b]">Основной бар</p><p className="text-xs text-[#718590]">Москва · UTC+3</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[#dce8e8] bg-white px-3 py-2 text-xs font-medium text-[#48616f] shadow-sm md:flex"><span className="size-2 rounded-full bg-[#2ca381] shadow-[0_0_0_4px_rgba(44,163,129,.1)]" />Пересчитано в 14:32</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="rounded-xl border-[#dbe5e9] bg-white text-[#4b6573]"><MoreHorizontal aria-hidden="true" size={18} /><span className="sr-only">Дополнительные действия</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild><a href="/reconciliation">Открыть сверку</a></DropdownMenuItem>
                <DropdownMenuItem asChild><a href="/analytics">Открыть аналитику</a></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><a href="/settings">Настройки</a></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
