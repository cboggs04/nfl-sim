"use client";

import { useMemo, useState } from "react";
import type { Conference, TeamOdds } from "@/lib/types";

type SortKey =
  | "name"
  | "wins"
  | "elo"
  | "exp_wins"
  | "p_division"
  | "p_playoffs"
  | "p_top_seed"
  | "p_conference"
  | "p_super_bowl";

const COLUMNS: { key: SortKey; label: string; hint?: string }[] = [
  { key: "wins", label: "Record", hint: "Games played so far" },
  { key: "elo", label: "Elo", hint: "Team rating (1500 = average)" },
  { key: "exp_wins", label: "Exp. wins", hint: "Average wins across all simulations" },
  { key: "p_division", label: "Division" },
  { key: "p_playoffs", label: "Playoffs" },
  { key: "p_top_seed", label: "#1 seed", hint: "Top seed: first-round bye" },
  { key: "p_conference", label: "Conf. title" },
  { key: "p_super_bowl", label: "Super Bowl" },
];

function sortValue(t: TeamOdds, key: SortKey): number | string {
  if (key === "name") return t.name;
  if (key === "wins") {
    const g = t.record.wins + t.record.losses + t.record.ties;
    return g ? (t.record.wins + t.record.ties / 2) / g : 0;
  }
  return t[key];
}

const pct = (p: number) => (p === 0 ? "0%" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`);

/** A percentage with a thin bar behind it. The number is always shown, the bar is a visual aid. */
function ProbCell({ p }: { p: number }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <div className="relative ml-auto h-6 w-24">
        <div
          className="absolute inset-y-1 left-0 rounded-sm bg-sky-500/25 dark:bg-sky-400/25"
          style={{ width: `${Math.max(p * 100, p > 0 ? 2 : 0)}%` }}
        />
        <span className="relative flex h-full items-center justify-end pr-1">{pct(p)}</span>
      </div>
    </td>
  );
}

export default function SeasonTable({ teams }: { teams: TeamOdds[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("p_super_bowl");
  const [desc, setDesc] = useState(true);
  const [conf, setConf] = useState<Conference | "ALL">("ALL");

  const rows = useMemo(() => {
    const filtered = conf === "ALL" ? teams : teams.filter((t) => t.conference === conf);
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return desc ? -cmp : cmp;
    });
  }, [teams, sortKey, desc, conf]);

  function onSort(key: SortKey) {
    if (key === sortKey) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(key !== "name"); // numbers start high-to-low, names A-Z
    }
  }

  const arrow = (key: SortKey) => (key === sortKey ? (desc ? " ▼" : " ▲") : "");

  return (
    <div>
      <div className="mb-3 flex gap-2" role="group" aria-label="Filter by conference">
        {(["ALL", "AFC", "NFC"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setConf(c)}
            aria-pressed={conf === c}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              conf === c
                ? "border-sky-600 bg-sky-600 text-white"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {c === "ALL" ? "All teams" : c}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="w-8 px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">
                <button onClick={() => onSort("name")} className="font-semibold uppercase hover:text-zinc-900 dark:hover:text-white">
                  Team{arrow("name")}
                </button>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right" aria-sort={c.key === sortKey ? (desc ? "descending" : "ascending") : "none"}>
                  <button
                    onClick={() => onSort(c.key)}
                    title={c.hint}
                    className="font-semibold uppercase hover:text-zinc-900 dark:hover:text-white"
                  >
                    {c.label}
                    {arrow(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((t, i) => (
              <tr key={t.team} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td className="px-3 py-2 text-zinc-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-zinc-500">{t.division}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {t.record.wins}-{t.record.losses}
                  {t.record.ties ? `-${t.record.ties}` : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{Math.round(t.elo)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.exp_wins.toFixed(1)}</td>
                <ProbCell p={t.p_division} />
                <ProbCell p={t.p_playoffs} />
                <ProbCell p={t.p_top_seed} />
                <ProbCell p={t.p_conference} />
                <ProbCell p={t.p_super_bowl} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
