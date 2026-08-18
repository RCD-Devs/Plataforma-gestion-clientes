import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

const mortend = localFont({
  src: [
    { path: "./fonts/Mortend-Bold.ttf", weight: "700" },
    { path: "./fonts/Mortend-Extrabold.ttf", weight: "800" },
  ],
  variable: "--font-mortend",
  display: "swap",
});

const openSans = localFont({
  src: [
    { path: "./fonts/OpenSans-Regular.ttf", weight: "400" },
    { path: "./fonts/OpenSans-SemiBold.ttf", weight: "600" },
    { path: "./fonts/OpenSans-Bold.ttf", weight: "700" },
  ],
  variable: "--font-opensans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "REVO · Gestión de clientes",
  description:
    "Plataforma de gestión de solicitudes y horas — REVO Business Evolution",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${mortend.variable} ${openSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
