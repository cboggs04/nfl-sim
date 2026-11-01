"use client";

import { useState } from "react";

export interface TabSpec {
  key: string;
  label: string;
  content: React.ReactNode;
}

/** A row of tabs; the first one is selected to start. Every panel is rendered by the server page, only one is shown. */
export default function Tabs({ tabs, label, idPrefix }: { tabs: TabSpec[]; label: string; idPrefix: string }) {
  const [active, setActive] = useState(tabs[0].key);
  return (
    <div className="mt-6">
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`${idPrefix}-panel-${t.key}`}
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
        <div key={t.key} role="tabpanel" id={`${idPrefix}-panel-${t.key}`} aria-labelledby={`${idPrefix}-tab-${t.key}`} hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
