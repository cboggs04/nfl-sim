import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NFL Season Simulator",
  description: "Monte Carlo projections of every team's record, playoff odds, and Super Bowl odds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm sm:px-6">
            <Link href="/" className="font-semibold">
              NFL Simulator
            </Link>
            <Link href="/" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
              Dashboard
            </Link>
            <Link href="/bracket" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
              Playoff simulator
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
