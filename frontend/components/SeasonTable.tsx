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
            className={`btn btn-sm ${conf === c ? "btn-primary" : "btn-ghost"}`}
          >
            {c === "ALL" ? "All teams" : c}
          </button>
        ))}
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm text-muted md:hidden">
        Sort by
        <select
          value={sortKey}
          onChange={(e) => {
            setSortKey(e.target.value as SortKey);
            setDesc(e.target.value !== "name");
          }}
          className="flex-1 rounded-md border border-line bg-panel px-3 py-2 font-semibold text-strong"
        >
          <option value="name">Team name</option>
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <p className="mb-2 text-xs text-muted md:hidden">Swipe sideways to see every stat. The team name stays pinned.</p>
      <div className="panel-flat overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line text-[10px] tracking-normal text-muted uppercase md:text-xs md:tracking-widest">
            <tr className="bg-head">
              <th className="sticky left-0 z-10 w-10 min-w-10 max-w-10 bg-panel px-2 py-3 text-left md:px-3">#</th>
              <th className="sticky left-10 z-10 min-w-[160px] border-r border-line/60 bg-panel px-2 py-3 text-left md:px-3">
                <button onClick={() => onSort("name")} className="font-semibold uppercase hover:text-strong">
                  Team{arrow("name")}
                </button>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-2 py-3 text-right md:px-3" aria-sort={c.key === sortKey ? (desc ? "descending" : "ascending") : "none"}>
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
                  className="font-display sticky left-0 z-10 w-10 min-w-10 max-w-10 bg-panel px-2 py-2 text-xl text-muted tabular-nums group-hover:bg-panel-2 md:px-3 md:text-2xl"
                  style={{ boxShadow: `inset 5px 0 0 ${teamInfo(t.team).primary}` }}
                >
                  {i + 1}
                </td>
                <td className="sticky left-10 z-10 min-w-[160px] border-r border-line/60 bg-panel px-2 py-2 group-hover:bg-panel-2 md:px-3">
                  <Link href={`/teams/${t.team}`} className="flex items-center gap-2 md:gap-4">
                    <TeamLogo abbr={t.team} size={34} />
                    <div>
                      <div className="text-sm font-semibold text-strong group-hover:text-accent-ink md:text-base">{t.name}</div>
                      <div className="text-xs text-muted">{t.division}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-2 py-2 text-right text-base font-semibold whitespace-nowrap tabular-nums md:px-3">
                  {t.record.wins}-{t.record.losses}
                  {t.record.ties ? `-${t.record.ties}` : ""}
                </td>
                <td className="px-2 py-2 text-right text-base tabular-nums md:px-3">{Math.round(t.elo)}</td>
                <td className="px-2 py-2 text-right text-base tabular-nums md:px-3">{t.exp_wins.toFixed(1)}</td>
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
