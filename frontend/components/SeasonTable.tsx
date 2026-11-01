"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ProbCell from "@/components/ProbCell";
import TeamLogo from "@/components/TeamLogo";
import { teamInfo } from "@/lib/teams";
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
      <div className="mb-4 flex gap-2" role="group" aria-label="Filter by conference">
        {(["ALL", "AFC", "NFC"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setConf(c)}
            aria-pressed={conf === c}
            className={`btn btn-sm ${conf === c ? "btn-gold" : "btn-ghost"}`}
          >
            {c === "ALL" ? "All teams" : c}
          </button>
        ))}
      </div>

      <div className="panel-flat overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line bg-head text-xs tracking-widest text-muted uppercase">
            <tr>
              <th className="w-10 px-3 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">
                <button onClick={() => onSort("name")} className="font-semibold uppercase hover:text-strong">
                  Team{arrow("name")}
                </button>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-3 text-right" aria-sort={c.key === sortKey ? (desc ? "descending" : "ascending") : "none"}>
                  <button
                    onClick={() => onSort(c.key)}
                    title={c.hint}
                    className={`font-semibold uppercase hover:text-strong ${c.key === sortKey ? "text-accent-ink" : ""}`}
                  >
                    {c.label}
                    {arrow(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map((t, i) => (
              <tr key={t.team} className="group transition-colors hover:bg-hover">
                <td
                  className="font-display px-3 py-2 text-2xl text-muted tabular-nums"
                  style={{ boxShadow: `inset 5px 0 0 ${teamInfo(t.team).primary}` }}
                >
                  {i + 1}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/teams/${t.team}`} className="flex items-center gap-4">
                    <TeamLogo abbr={t.team} size={48} />
                    <div>
                      <div className="text-base font-semibold text-strong group-hover:text-accent-ink">{t.name}</div>
                      <div className="text-xs text-muted">{t.division}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-2 text-right text-base font-semibold tabular-nums">
                  {t.record.wins}-{t.record.losses}
                  {t.record.ties ? `-${t.record.ties}` : ""}
                </td>
                <td className="px-3 py-2 text-right text-base tabular-nums">{Math.round(t.elo)}</td>
                <td className="px-3 py-2 text-right text-base tabular-nums">{t.exp_wins.toFixed(1)}</td>
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
