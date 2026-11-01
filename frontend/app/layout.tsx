import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  style: ["italic"],
});

export const metadata: Metadata = {
  title: "NFL Season Simulator",
  description: "Monte Carlo projections of every team's record, playoff odds, and Super Bowl odds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <head>
        {/* Set the saved theme before first paint so there's no flash. Dark is the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem("theme")==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <nav className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
            <Link href="/" className="flex items-center gap-2" aria-label="NFL Simulator home">
              <span
                className="font-display bg-accent px-3 py-1 text-2xl text-[#1a1200]"
                style={{ clipPath: "polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)" }}
              >
                NFL
              </span>
              <span className="font-display text-2xl text-strong">SIM</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <NavLinks />
              <ThemeToggle />
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
