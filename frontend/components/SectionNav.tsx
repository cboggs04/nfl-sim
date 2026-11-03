"use client";

import { useEffect, useState } from "react";

export interface SectionLink {
  id: string;
  label: string;
}

/**
 * "On this page": a row of chips that sticks under the top bar on long pages. Clicking one scrolls to that section, and the chip for the
 * section you're reading is highlighted. Sections that aren't on screen right now (inside a hidden tab) are skipped.
 */
export default function SectionNav({ items, className = "" }: { items: SectionLink[]; className?: string }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = items[0]?.id;
      let last: string | undefined;
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (!el || el.getClientRects().length === 0) continue; // not on screen (hidden tab)
        last = it.id;
        if (el.getBoundingClientRect().top <= 140) current = it.id;
      }
      // at the very bottom of the page the last section can't scroll up to the top, so it counts as the one being read
      if (last && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = last;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  const go = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <nav aria-label="On this page" className={`sticky top-14 z-20 -mx-4 border-b border-line bg-background px-4 py-2 sm:top-[65px] sm:-mx-6 sm:px-6 ${className}`}>
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-xs font-semibold tracking-widest text-muted uppercase">On this page</span>
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => go(it.id)}
            aria-current={active === it.id ? "true" : undefined}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap ring-1 transition-colors ${
              active === it.id ? "bg-accent text-on-accent ring-accent" : "bg-head text-muted ring-line hover:bg-hover hover:text-strong"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
