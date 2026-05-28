import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OSINT Data Scanner - Verifica tu Huella Digital",
  description: "Descubre donde esta expuesta tu informacion personal en internet. Escaneo OSINT automatizado con 7 motores de busqueda.",
  keywords: ["OSINT", "privacidad digital", "datos expuestos", "scraping", "huella digital", "seguridad"],
  authors: [{ name: "OSINT Scanner" }],
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "OSINT Data Scanner",
    description: "Verifica donde estan expuestos tus datos personales en internet",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
