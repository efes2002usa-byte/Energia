"use client";

import { AnalyticsPage } from "@/components/analytics-page";
import { CalendarPage as PersistentCalendarPage } from "@/components/calendar-page";
import { DashboardPage } from "@/components/dashboard-page";
import { DevicesPage as PersistentDevicesPage } from "@/components/devices-page";
import { MeterPage } from "@/components/meter-page";
import { OperationsPage } from "@/components/operations-page";
import { ReconciliationPage as PersistentReconciliationPage } from "@/components/reconciliation-page";
import { SettingsPage as PersistentSettingsPage } from "@/components/settings-page";

export type Section = "today" | "calendar" | "devices" | "meter" | "reconciliation" | "analytics" | "operations" | "settings";

export function SectionContent({ section }: { section: Section }) {
  if (section === "today") return <DashboardPage />;
  if (section === "calendar") return <PersistentCalendarPage />;
  if (section === "devices") return <PersistentDevicesPage />;
  if (section === "meter") return <MeterPage />;
  if (section === "reconciliation") return <PersistentReconciliationPage />;
  if (section === "analytics") return <AnalyticsPage />;
  if (section === "operations") return <OperationsPage />;
  return <PersistentSettingsPage />;
}
