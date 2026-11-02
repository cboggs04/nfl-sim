"use client";

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
    <td className="px-2 py-2 text-right tabular-nums md:px-3">
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
        <table className="w-full text-sm md:min-w-[640px]">
          {columns.length > 0 && (
            <thead className="border-b border-line text-[11px] tracking-widest text-muted uppercase">
              <tr>
                <th className="sticky left-0 z-10 bg-panel px-3 py-2 text-left font-semibold md:px-4">Player</th>
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
                  <td className="sticky left-0 z-10 bg-panel px-3 py-2 md:px-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <span className="md:hidden">
                        <Headshot src={p.headshot} name={p.name} color={color} size={36} />
                      </span>
                      <span className="hidden md:block">
                        <Headshot src={p.headshot} name={p.name} color={color} size={48} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-strong md:truncate md:text-base">{p.name}</span>
                          {badge && (
                            <span title={badge.title} className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ring-1 ${badge.style}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted">
                          {p.jersey != null && <span>#{p.jersey} · </span>}
                          {p.position}
                          {p.age != null && <span className="hidden md:inline"> · {p.age} yrs old</span>}
                          {p.years_exp != null && <span className="hidden md:inline"> · {p.years_exp === 0 ? "rookie" : `${p.years_exp} yr${p.years_exp === 1 ? "" : "s"} exp`}</span>}
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
