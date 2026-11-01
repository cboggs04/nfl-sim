"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/bracket", label: "Playoff simulator" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 sm:gap-3">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" || pathname.startsWith("/teams") : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`font-display border-b-[3px] px-2 py-1 text-lg transition-colors sm:px-3 sm:text-xl ${
              active ? "border-accent text-strong" : "border-transparent text-muted hover:text-strong"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
