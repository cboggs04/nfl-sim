"use client";

import { useState } from "react";

export interface DashTab {
  key: string;
  label: string;
  title: [string, string]; // page heading: [white part, accent part]
  content: React.ReactNode;
}

/** The dashboard's tabs (team odds / league-wide leaders). Content is rendered by the server page. */
export default function DashboardTabs({ eyebrow, intro, tabs }: { eyebrow: string; intro: React.ReactNode; tabs: DashTab[] }) {
  const [active, setActive] = useState(tabs[0].key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <>
      <header className="rise">
        <div className="text-sm font-semibold tracking-[0.25em] text-accent-ink uppercase">{eyebrow}</div>
        <h1 className="font-display mt-1 text-6xl text-strong sm:text-8xl">
          {current.title[0]} <span className="text-accent-ink">{current.title[1]}</span>
        </h1>
        {intro}
      </header>

      <div role="tablist" aria-label="Dashboard sections" className="mt-8 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`dash-tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`dash-panel-${t.key}`}
            onClick={() => setActive(t.key)}
            className={`font-display -mb-px border-b-[3px] px-4 py-2 text-2xl transition-colors ${
              active === t.key ? "border-accent text-strong" : "border-transparent text-muted hover:text-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`dash-panel-${t.key}`} aria-labelledby={`dash-tab-${t.key}`} hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </>
  );
}
