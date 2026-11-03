"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/bracket", label: "Playoff simulator" },
  { href: "/leaders", label: "Stat leaders" },
  { href: "/whatif", label: "What-if" },
  { href: "/backtest", label: "Model accuracy" },
  { href: "/play", label: "Play now" },
];

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/teams") : pathname.startsWith(href));

/** The nav links: in a row on wide screens, behind a menu button on phones. */
export default function NavLinks() {
  const pathname = usePathname();
  // The menu is open "for" the page it was opened on, so moving to another page closes it without any extra code.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  return (
    <>
      <div className="hidden items-center gap-3 md:flex">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(l.href, pathname) ? "page" : undefined}
            className={`font-display border-b-[3px] px-3 py-1 text-xl transition-colors ${
              isActive(l.href, pathname) ? "border-accent text-strong" : "border-transparent text-muted hover:text-strong"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <button
        onClick={() => setOpenFor(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted ring-1 ring-line hover:bg-hover hover:text-strong md:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-line bg-background shadow-lg shadow-black/30 backdrop-blur md:hidden">
          <ul className="mx-auto max-w-7xl px-4 py-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href, pathname) ? "page" : undefined}
                  className={`font-display block border-l-4 px-3 py-3 text-2xl ${
                    isActive(l.href, pathname) ? "border-accent text-strong" : "border-transparent text-muted"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
