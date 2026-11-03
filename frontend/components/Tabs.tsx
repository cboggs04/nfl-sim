"use client";

import { useState } from "react";
import TabButtons from "@/components/TabButtons";

export interface TabSpec {
  key: string;
  label: string;
  content: React.ReactNode;
}

/** A row of tabs; the first one is selected to start. Every panel is rendered by the server page, only one is shown. */
export default function Tabs({ tabs, label, idPrefix }: { tabs: TabSpec[]; label: string; idPrefix: string }) {
  const [active, setActive] = useState(tabs[0].key);
  return (
    <div className="mt-5">
      <TabButtons
        tabs={tabs}
        active={active}
        onSelect={setActive}
        label={label}
        idFor={(k) => `${idPrefix}-tab-${k}`}
        panelIdFor={(k) => `${idPrefix}-panel-${k}`}
      />
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`${idPrefix}-panel-${t.key}`} aria-labelledby={`${idPrefix}-tab-${t.key}`} hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
