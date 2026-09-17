import { DashboardPage } from "@/components/dashboard-page";
import { EnergiaShell } from "@/components/energia-shell";

export default function Home() {
  return <EnergiaShell><main className="mx-auto w-full max-w-[1560px] px-4 pb-10 pt-6 sm:px-7 lg:px-9 lg:pt-8"><DashboardPage /></main></EnergiaShell>;
}
