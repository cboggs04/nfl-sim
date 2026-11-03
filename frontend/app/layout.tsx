import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import AboutModel from "@/components/AboutModel";
import AboutModelLoader from "@/components/AboutModelLoader";
import NavLinks from "@/components/NavLinks";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import SiteFooter from "@/components/SiteFooter";
import SiteFooterLoader from "@/components/SiteFooterLoader";
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

// The retro font for the Super Bowl pop-up.
const pixel = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "NFL Season Simulator",
  description: "Monte Carlo projections of every team's record, playoff odds, and Super Bowl odds.",
  // "Add to Home Screen" on an iPhone opens the site with no Safari address bar (a web page can't hide it any other way).
  // "default" keeps the page below the status bar (the clock and battery), so nothing is drawn or blurred behind it.
  appleWebApp: { capable: true, title: "NFL Sim", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  viewportFit: "cover", // let the page use the whole screen, including behind the notch (the game pads for the safe areas itself)
  themeColor: "#08122a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${pixel.variable} h-full antialiased`}>
      <head>
        {/* Set the saved theme before first paint so there's no flash. Light is the default; a saved choice of dark wins. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem("theme")==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <RegisterServiceWorker />
        {/* (the top padding keeps the menu button clear of the iPhone clock and notch when the site runs as an installed app) */}
        <nav className="sticky top-0 z-30 border-b border-line bg-background pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <Link href="/" className="flex items-center gap-2" aria-label="NFL Simulator home">
              <Image src="/nfl-logo.png" alt="NFL" width={44} height={44} priority className="h-9 w-9 object-contain sm:h-11 sm:w-11" />
              <span className="font-display text-2xl text-strong sm:text-3xl">SIMULATOR</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <Suspense fallback={<div className="hidden h-9 w-72 md:block" aria-hidden />}>
                <NavLinks />
              </Suspense>
              <Suspense fallback={<AboutModel />}>
                <AboutModelLoader />
              </Suspense>
              <ThemeToggle />
            </div>
          </div>
        </nav>
        {children}
        <Suspense fallback={<SiteFooter />}>
          <SiteFooterLoader />
        </Suspense>
      </body>
    </html>
  );
}
