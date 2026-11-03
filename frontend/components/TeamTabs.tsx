"use client";

import { useState } from "react";
import TabButtons from "@/components/TabButtons";

/** Overview / Season simulator tabs. Both panels are rendered by the server page; this only decides which one shows. */
export default function TeamTabs({ overview, simulator }: { overview: React.ReactNode; simulator: React.ReactNode }) {
  const [tab, setTab] = useState<"overview" | "simulator">("overview");
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "simulator", label: "Season simulator" },
  ];
  return (
    <div className="mt-6">
      <TabButtons tabs={tabs} active={tab} onSelect={(k) => setTab(k as "overview" | "simulator")} label="Team page sections" idFor={(k) => `tab-${k}`} panelIdFor={(k) => `panel-${k}`} />
      <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden={tab !== "overview"}>
        {overview}
      </div>
      <div role="tabpanel" id="panel-simulator" aria-labelledby="tab-simulator" hidden={tab !== "simulator"}>
        {simulator}
      </div>
    </div>
  );
}
