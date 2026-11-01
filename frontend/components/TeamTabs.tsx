"use client";

import { useState } from "react";

/** Overview / Roster tabs. Both panels are rendered by the server page; this only decides which one shows. */
export default function TeamTabs({ overview, roster }: { overview: React.ReactNode; roster: React.ReactNode }) {
  const [tab, setTab] = useState<"overview" | "roster">("overview");
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "roster", label: "Roster & player stats" },
  ] as const;
  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Team page sections" className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`font-display -mb-px border-b-[3px] px-4 py-2 text-2xl transition-colors ${
              tab === t.key ? "border-accent text-strong" : "border-transparent text-muted hover:text-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden={tab !== "overview"}>
        {overview}
      </div>
      <div role="tabpanel" id="panel-roster" aria-labelledby="tab-roster" hidden={tab !== "roster"}>
        {roster}
      </div>
    </div>
  );
}
