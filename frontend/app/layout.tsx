import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import NavLinks from "@/components/NavLinks";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800"],
  style: ["normal"],
});

export const metadata: Metadata = {
  title: "NFL Season Simulator",
  description: "Monte Carlo projections of every team's record, playoff odds, and Super Bowl odds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <head>
        {/* Set the saved theme before first paint so there's no flash. Light is the default; a saved choice of dark wins. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem("theme")==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <nav className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <Link href="/" className="flex items-center gap-2" aria-label="NFL Simulator home">
              <Image src="/nfl-logo.png" alt="NFL" width={44} height={44} priority className="h-9 w-9 object-contain sm:h-11 sm:w-11" />
              <span className="font-display text-2xl text-strong sm:text-3xl">SIMULATOR</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <Suspense fallback={<div className="hidden h-9 w-72 md:block" aria-hidden />}>
                <NavLinks />
              </Suspense>
              <ThemeToggle />
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
