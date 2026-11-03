"use client";

import Link from "next/link";
import { useState } from "react";
import Headshot from "@/components/Headshot";
import { pct } from "@/components/ProbCell";
import TeamLogo from "@/components/TeamLogo";
import { STAT_LABELS, SUMMARY_STATS, formatStat } from "@/lib/roster";
import { teamInfo } from "@/lib/teams";
import type { AwardRow, LeaderRow, LeadersResponse } from "@/lib/types";

const AWARD_INFO: { key: string; title: string; blurb: string }[] = [
  { key: "mvp", title: "Most Valuable Player", blurb: "Best production on a winning team" },
  { key: "opoty", title: "Offensive Player of the Year", blurb: "Best offensive production, any team" },
  { key: "dpoty", title: "Defensive Player of the Year", blurb: "Sacks, takeaways and tackles" },
  { key: "oroy", title: "Offensive Rookie of the Year", blurb: "Best first-year offensive player" },
  { key: "droy", title: "Defensive Rookie of the Year", blurb: "Best first-year defender" },
];

const LEADER_INFO: { key: string; title: string }[] = [
  { key: "passing_yards", title: "Passing yards" },
  { key: "passing_tds", title: "Passing touchdowns" },
  { key: "receiving_yards", title: "Receiving yards" },
  { key: "receiving_tds", title: "Receiving touchdowns" },
  { key: "rushing_yards", title: "Rushing yards" },
  { key: "rushing_tds", title: "Rushing touchdowns" },
];

function StatLine({ row }: { row: AwardRow }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {(SUMMARY_STATS[row.position] ?? []).map((s) => (
        <span key={s} className="text-sm text-muted">
          <b className="text-base font-semibold text-strong tabular-nums">{formatStat(s, row.proj[s] ?? 0)}</b> {STAT_LABELS[s]?.short ?? s}
        </span>
      ))}
    </div>
  );
}

function AwardCard({ title, blurb, rows }: { title: string; blurb: string; rows: AwardRow[] }) {
  const [fav, ...rest] = rows;
  if (!fav) return null;
  const info = teamInfo(fav.team);
  const topProb = Math.max(...rows.map((r) => r.prob), 0.01);
  return (
    <section className="panel flex h-full flex-col">
      <div
        className="p-5 text-center"
        style={{ backgroundColor: "var(--card-end)", backgroundImage: `linear-gradient(160deg, ${info.primary}cc, ${info.primary}33 60%, var(--card-end))` }}
      >
        <h3 className="font-display text-2xl text-white">{title}</h3>
        <p className="text-xs text-white/70">{blurb}</p>
        <div className="mt-4 flex justify-center">
          <Headshot src={fav.headshot} name={fav.name} color="#ffffff" size={96} />
        </div>
        <div className="font-display mt-3 text-3xl text-white [text-shadow:0_2px_8px_rgba(0,0,0,.5)]">{fav.name}</div>
        <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/85">
          <TeamLogo abbr={fav.team} size={24} />
          {teamInfo(fav.team).name} · {fav.position}
        </div>
        <div className="font-display mt-2 text-5xl text-white">{pct(fav.prob)}</div>
        <div className="text-[11px] font-semibold tracking-widest text-white/70 uppercase">chance to win</div>
        <div className="text-white [&_b]:text-white [&_span]:text-white/75">
          <StatLine row={fav} />
        </div>
      </div>
      <ol className="divide-y divide-line/60 p-2">
        {rest.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-2 py-1.5">
            <Headshot src={r.headshot} name={r.name} color={teamInfo(r.team).primary} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-strong">{r.name}</div>
              <div className="text-[11px] text-muted">
                <Link href={`/teams/${r.team}`} className="hover:text-accent-ink hover:underline" title={`${teamInfo(r.team).name} team page`}>
                  {r.team}
                </Link>{" "}
                · {r.position}
              </div>
            </div>
            <div className="w-24">
              <div className="h-1.5 overflow-hidden rounded-full bg-gauge" aria-hidden>
                <div className="h-full rounded-full bg-blue" style={{ width: `${(r.prob / topProb) * 100}%` }} />
              </div>
            </div>
            <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct(r.prob)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LeaderCard({ title, stat, rows, projected }: { title: string; stat: string; rows: LeaderRow[]; projected: boolean }) {
  const sorted = [...rows].sort((a, b) => (projected ? b.projected - a.projected : b.current - a.current));
  return (
    <section className="panel-flat overflow-hidden">
      <h2 className="font-display border-b border-line bg-head px-4 py-2 text-2xl text-strong">{title}</h2>
      <ol className="divide-y divide-line/60">
        {sorted.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2" style={{ boxShadow: `inset 4px 0 0 ${teamInfo(r.team).primary}` }}>
            <span className="font-display w-5 text-xl text-muted tabular-nums">{i + 1}</span>
            <Headshot src={r.headshot} name={r.name} color={teamInfo(r.team).primary} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-strong">{r.name}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <Link href={`/teams/${r.team}`} className="inline-flex items-center gap-1.5 hover:text-accent-ink hover:underline" title={`${teamInfo(r.team).name} team page`}>
                  <TeamLogo abbr={r.team} size={16} />
                  {r.team}
                </Link>
                · {r.position}
                {projected && r.p_lead >= 0.01 && (
                  <span className="rounded bg-accent/15 px-1.5 text-accent-ink" title="Chance he finishes first in the league">
                    {pct(r.p_lead)} to lead
                  </span>
                )}
              </div>
            </div>
            <div className="text-right tabular-nums">
              <div className="text-lg font-semibold">{formatStat(stat, projected ? r.projected : r.current)}</div>
              {projected && <div className="text-[10px] text-muted">{formatStat(stat, r.current)} so far</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** League-wide view: projected award winners and stat leaders, from the precomputed simulations. */
export default function LeadersView({ data }: { data: LeadersResponse }) {
  const [projected, setProjected] = useState(true);
  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-muted">Top 10 in each category. &quot;To lead&quot; is the chance he finishes first.</p>
          <div role="group" aria-label="Which totals to show" className="flex gap-2">
            {[
              { v: true, label: "Projected final" },
              { v: false, label: "So far" },
            ].map((o) => (
              <button key={o.label} onClick={() => setProjected(o.v)} aria-pressed={projected === o.v} className={`btn btn-sm text-lg ${projected === o.v ? "btn-primary" : "btn-ghost"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {LEADER_INFO.map((l) => (
            <LeaderCard key={l.key} title={l.title} stat={l.key} rows={data.leaders[l.key] ?? []} projected={projected} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-4xl text-strong">Award watch</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Each player&apos;s chance to win, from {data.n_sims.toLocaleString("en-US")} simulated seasons. Awards go to the best
          production (MVP also counts the team&apos;s record), and a player can win only one award a season, so a player who wins
          MVP is not also counted for Offensive Player of the Year. Real voters are less predictable, so read this as who the numbers favor.
        </p>
        {/* Wrapping flex (not a grid) so a short last row is centered under the rows above it. */}
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          {AWARD_INFO.map((a) => (
            <div key={a.key} className="w-full md:w-[calc(50%-0.5rem)] xl:w-[calc((100%-2rem)/3)]">
              <AwardCard title={a.title} blurb={a.blurb} rows={data.awards[a.key] ?? []} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
