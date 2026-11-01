"use client";

import { useMemo, useState } from "react";
import Headshot from "@/components/Headshot";
import { MAIN_STAT, POSITION_NAMES, STAT_LABELS, UNITS, formatStat } from "@/lib/roster";
import type { RosterPlayer, TeamRoster } from "@/lib/types";

export type View = "current" | "projected" | "simulated";

const STATUS_BADGE: Record<string, { label: string; style: string; title: string }> = {
  RES: { label: "IR", style: "bg-bad/20 text-bad-ink ring-bad/40", title: "Injured reserve: projected to miss the rest of the season" },
  INA: { label: "OUT", style: "bg-accent/20 text-accent-ink ring-accent/40", title: "Inactive this week: counted as playing about half of his remaining games" },
};

function Cell({ stat, value, base, view, showDelta }: { stat: string; value: number; base: number; view: View; showDelta: boolean }) {
  const added = value - base;
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <div className="text-base font-semibold">{formatStat(stat, value)}</div>
      {view !== "current" && showDelta && Math.round(added * 2) > 0 && <div className="text-[10px] text-muted">+{formatStat(stat, added)}</div>}
    </td>
  );
}

export function PositionTable({
  position,
  players,
  columns,
  view,
  simStats,
  simGp,
  color,
  showDelta = true,
}: {
  showDelta?: boolean;
  position: string;
  players: RosterPlayer[];
  columns: string[];
  view: View;
  simStats: Map<string, Record<string, number>>;
  simGp: Map<string, number>;
  color: string;
}) {
  const valueOf = (p: RosterPlayer, stat: string) =>
    view === "simulated" ? (simStats.get(p.id)?.[stat] ?? p.proj[stat]) : view === "projected" ? p.proj[stat] : p.stats[stat];
  const gpOf = (p: RosterPlayer) => (view === "simulated" ? (simGp.get(p.id) ?? p.proj_gp) : view === "projected" ? p.proj_gp : p.gp);
  const main = MAIN_STAT[position];

  const rows = [...players].sort((a, b) => {
    if (main) {
      const d = valueOf(b, main) - valueOf(a, main);
      if (d !== 0) return d;
    }
    return gpOf(b) - gpOf(a) || a.name.localeCompare(b.name);
  });

  return (
    <section className="panel-flat overflow-hidden">
      <h3 className="font-display border-b border-line bg-head px-4 py-2 text-2xl text-strong">
        {POSITION_NAMES[position] ?? position} <span className="text-base text-muted">{players.length}</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          {columns.length > 0 && (
            <thead className="border-b border-line text-[11px] tracking-widest text-muted uppercase">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Player</th>
                <th className="px-3 py-2 text-right font-semibold" title="Games played">
                  GP
                </th>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-semibold" title={STAT_LABELS[c]?.long}>
                    {STAT_LABELS[c]?.short ?? c}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-line/60">
            {rows.map((p) => {
              const badge = STATUS_BADGE[p.status];
              return (
                <tr key={p.id} className={`hover:bg-hover ${p.status === "RES" ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Headshot src={p.headshot} name={p.name} color={color} size={48} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-base font-semibold text-strong">{p.name}</span>
                          {badge && (
                            <span title={badge.title} className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ring-1 ${badge.style}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted">
                          {p.jersey != null && <span>#{p.jersey} · </span>}
                          {p.position}
                          {p.age != null && <span> · {p.age} yrs old</span>}
                          {p.years_exp != null && <span> · {p.years_exp === 0 ? "rookie" : `${p.years_exp} yr${p.years_exp === 1 ? "" : "s"} exp`}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  {columns.length > 0 && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className="text-base font-semibold">{Math.round(gpOf(p))}</div>
                      {view !== "current" && showDelta && gpOf(p) - p.gp >= 0.5 && <div className="text-[10px] text-muted">+{Math.round(gpOf(p) - p.gp)}</div>}
                    </td>
                  )}
                  {columns.map((c) => (
                    <Cell key={c} stat={c} value={valueOf(p, c) ?? 0} base={p.stats[c] ?? 0} view={view} showDelta={showDelta} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The roster's position tables, grouped Offense / Defense / Special teams, for one unit or all. */
export function PositionSections({
  roster,
  color,
  unit,
  view,
  simStats,
  simGp,
  showDelta = true,
}: {
  roster: TeamRoster;
  color: string;
  unit: string;
  view: View;
  simStats: Map<string, Record<string, number>>;
  simGp: Map<string, number>;
  showDelta?: boolean;
}) {
  return (
    <div className="mt-4 space-y-8">
      {UNITS.filter((u) => unit === "All" || u.key === unit).map((u) => (
        <div key={u.key}>
          <h2 className="font-display mb-3 text-4xl text-strong">{u.key}</h2>
          <div className="space-y-4">
            {u.positions.map((pos) => {
              const players = roster.players.filter((p) => p.position === pos);
              if (!players.length) return null;
              return (
                <PositionTable
                  key={pos}
                  position={pos}
                  players={players}
                  columns={roster.columns[pos] ?? []}
                  view={view}
                  simStats={simStats}
                  simGp={simGp}
                  color={color}
                  showDelta={showDelta}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Every player on the team, grouped by unit and position, with stats so far or projected through the end of the season. */
export default function RosterView({ roster, color }: { roster: TeamRoster; color: string }) {
  const [view, setView] = useState<View>("current");
  const [unit, setUnit] = useState<string>("All");
  const noSim = useMemo(() => new Map<string, Record<string, number>>(), []);
  const noGp = useMemo(() => new Map<string, number>(), []);

  const views: { key: View; label: string }[] = [
    { key: "current", label: "So far" },
    { key: "projected", label: "Projected final" },
  ];

  return (
    <div className="mt-6">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div role="group" aria-label="Which numbers to show" className="flex flex-wrap gap-2">
          {views.map((v) => (
            <button key={v.key} aria-pressed={view === v.key} onClick={() => setView(v.key)} className={`btn btn-sm text-lg ${view === v.key ? "btn-primary" : "btn-ghost"}`}>
              {v.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Want a simulated season? Use the Season simulator tab.</p>
      </div>
      <p className="mt-3 text-xs text-muted">
        {view === "current"
          ? `Regular-season totals after ${roster.team_games_played} games.`
          : `Each player's current total plus his per-game rate (blended with last season) × the chance he plays × ${roster.games_remaining} remaining games. Small gray numbers show what's still to come.`}
      </p>

      <div className="mt-4 flex gap-2" role="group" aria-label="Filter by unit">
        {["All", ...UNITS.map((u) => u.key)].map((u) => (
          <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u} className={`btn btn-sm text-lg ${unit === u ? "btn-primary" : "btn-ghost"}`}>
            {u}
          </button>
        ))}
      </div>

      <PositionSections roster={roster} color={color} unit={unit} view={view} simStats={noSim} simGp={noGp} />
    </div>
  );
}
