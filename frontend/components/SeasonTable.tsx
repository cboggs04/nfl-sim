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

const COLUMNS: { key: SortKey; label: string; hint?: string; mobile?: boolean }[] = [
  { key: "wins", label: "Record", mobile: true, hint: "Games played so far" },
  { key: "elo", label: "Elo", hint: "Team rating (1500 = average)" },
  { key: "exp_wins", label: "Exp. wins", hint: "Average wins across all simulations" },
  { key: "p_division", label: "Division" },
  { key: "p_playoffs", label: "Playoffs", mobile: true },
  { key: "p_top_seed", label: "#1 seed", hint: "Top seed: first-round bye" },
  { key: "p_conference", label: "Conf. title" },
  { key: "p_super_bowl", label: "Super Bowl", mobile: true },
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

      <div className="panel-flat overflow-x-auto">
        <table className="w-full text-sm md:min-w-[900px]">
          <thead className="border-b border-line bg-head text-[10px] tracking-normal text-muted uppercase md:text-xs md:tracking-widest">
            <tr>
              <th className="w-8 px-2 py-3 text-left md:w-10 md:px-3">#</th>
              <th className="px-2 py-3 text-left md:px-3">
                <button onClick={() => onSort("name")} className="font-semibold uppercase hover:text-strong">
                  Team{arrow("name")}
                </button>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`px-1.5 py-3 text-right md:px-3 ${c.mobile ? "" : "hidden md:table-cell"}`} aria-sort={c.key === sortKey ? (desc ? "descending" : "ascending") : "none"}>
                  <button
                    onClick={() => onSort(c.key)}
                    title={c.hint}
                    className={`font-semibold uppercase hover:text-strong ${c.key === sortKey ? "text-accent-ink" : ""}`}
                  >
                    {c.mobile && c.key === "wins" ? (
                      <>
                        <span className="md:hidden">W-L</span>
                        <span className="hidden md:inline">{c.label}</span>
                      </>
                    ) : (
                      c.label
                    )}
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
                  className="font-display px-2 py-2 text-xl text-muted tabular-nums md:px-3 md:text-2xl"
                  style={{ boxShadow: `inset 5px 0 0 ${teamInfo(t.team).primary}` }}
                >
                  {i + 1}
                </td>
                <td className="px-2 py-2 md:px-3">
                  <Link href={`/teams/${t.team}`} className="flex items-center gap-2 md:gap-4">
                    <TeamLogo abbr={t.team} size={34} />
                    <div>
                      <div className="text-base font-semibold text-strong group-hover:text-accent-ink">{t.name}</div>
                      <div className="text-xs text-muted">{t.division}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-1.5 py-2 text-right text-sm font-semibold tabular-nums md:px-3 md:text-base">
                  {t.record.wins}-{t.record.losses}
                  {t.record.ties ? `-${t.record.ties}` : ""}
                </td>
                <td className="hidden px-3 py-2 text-right text-base tabular-nums md:table-cell">{Math.round(t.elo)}</td>
                <td className="hidden px-3 py-2 text-right text-base tabular-nums md:table-cell">{t.exp_wins.toFixed(1)}</td>
                <ProbCell p={t.p_division} className="hidden md:table-cell" />
                <ProbCell p={t.p_playoffs} />
                <ProbCell p={t.p_top_seed} className="hidden md:table-cell" />
                <ProbCell p={t.p_conference} className="hidden md:table-cell" />
                <ProbCell p={t.p_super_bowl} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
