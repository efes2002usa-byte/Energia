import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Energia — управление энергопотреблением",
  description: "Учёт, распределение и анализ потребления электроэнергии бара.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
