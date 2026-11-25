"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Headshot from "@/components/Headshot";
import { pct } from "@/components/ProbCell";
import TabButtons from "@/components/TabButtons";
import TeamLogo from "@/components/TeamLogo";
import { getGameDetail } from "@/lib/api";
import { teamInfo } from "@/lib/teams";
import { kickoffShort } from "@/lib/time";
import type { BoxCategory, GameDetail, GameLeader, ScoreGame, TeamOdds } from "@/lib/types";

const POLL_LIVE = 30_000;

/** The expanded part of a game on the scores page. Loads the game's detail when opened (and every 30 s while it's live). */
export default function GameDetailPanel({
  game,
  live,
  leaders,
  odds,
  pHome,
}: {
  game: ScoreGame;
  live: boolean;
  leaders: GameLeader[];
  odds: Record<string, TeamOdds>;
  pHome: number;
}) {
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [failed, setFailed] = useState(false);
  // Not started (by ESPN's own state once loaded; a demo "live" game is really still to come, so it shows the matchup too).
  const upcoming = !game.played && (detail ? detail.state === "pre" : !live);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const d = await getGameDetail(game.game_id);
        if (stopped) return;
        setDetail(d);
        setFailed(false);
        if (d.state === "in") timer = setTimeout(load, POLL_LIVE);
      } catch {
        if (!stopped) setFailed(true);
      }
    }
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [game.game_id]);

  if (upcoming) return <Matchup game={game} odds={odds} detail={detail} />;
  if (failed || (detail && !detail.available)) {
    return <p className="p-5 text-sm text-muted">Game details aren&apos;t available right now (they come from ESPN&apos;s feed). Try again in a minute.</p>;
  }
  if (!detail) return <PanelSkeleton />;
  return <Played game={game} detail={detail} leaders={leaders} pHome={pHome} />;
}

function PanelSkeleton() {
  return (
    <div className="grid gap-4 p-5 lg:grid-cols-2" aria-label="Loading game details">
      {[0, 1].map((i) => (
        <div key={i} className="h-48 animate-pulse rounded-lg bg-head" />
      ))}
    </div>
  );
}

// ---------- played or live ----------

function Played({ game, detail, leaders, pHome }: { game: ScoreGame; detail: GameDetail; leaders: GameLeader[]; pHome: number }) {
  const [tab, setTab] = useState<"summary" | "box" | "stats">("summary");
  const tabs = [
    { key: "summary", label: "Summary" },
    { key: "box", label: "Box score" },
    { key: "stats", label: "Team stats" },
  ];
  const id = (k: string) => `${game.game_id}-${k}`;
  return (
    <div className="p-4 sm:p-5">
      <TabButtons tabs={tabs} active={tab} onSelect={(k) => setTab(k as typeof tab)} label="Game details" idFor={(k) => `tab-${id(k)}`} panelIdFor={(k) => `panel-${id(k)}`} />
      <div role="tabpanel" id={`panel-${id(tab)}`} aria-labelledby={`tab-${id(tab)}`} className="mt-4">
        {tab === "summary" && <Summary game={game} detail={detail} leaders={leaders} pHome={pHome} />}
        {tab === "box" && <BoxScore game={game} detail={detail} />}
        {tab === "stats" && <TeamStats game={game} detail={detail} />}
      </div>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg bg-panel-2/60 p-4 ring-1 ring-line/70 ${className}`}>
      <h3 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Summary({ game, detail, leaders, pHome }: { game: ScoreGame; detail: GameDetail; leaders: GameLeader[]; pHome: number }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="flex flex-col gap-4 lg:col-span-3">
        <Card title="Line score">
          <LineScore game={game} detail={detail} />
        </Card>
        <Card title="Scoring summary">
          <ScoringSummary game={game} detail={detail} />
        </Card>
      </div>
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card title="Model win probability">
          <WinProbChart game={game} detail={detail} pHome={pHome} />
        </Card>
        {leaders.length > 0 && (
          <Card title="Game leaders">
            <Leaders leaders={leaders} />
          </Card>
        )}
        <GameInfo detail={detail} game={game} />
      </div>
    </div>
  );
}

function LineScore({ game, detail }: { game: ScoreGame; detail: GameDetail }) {
  const n = Math.max(4, detail.home_lines.length, detail.away_lines.length);
  const head = Array.from({ length: n }, (_, i) => (i < 4 ? String(i + 1) : n > 5 ? `OT${i - 3}` : "OT"));
  const rows: [string, number[], number][] = [
    [game.away, detail.away_lines, detail.away_score],
    [game.home, detail.home_lines, detail.home_score],
  ];
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-xs text-muted">
        <tr>
          <th className="pb-2 text-left font-semibold">Team</th>
          {head.map((h) => (
            <th key={h} className="w-10 pb-2 text-center font-semibold">
              {h}
            </th>
          ))}
          <th className="w-12 pb-2 text-center font-semibold text-strong">T</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line/60">
        {rows.map(([abbr, lines, total]) => (
          <tr key={abbr}>
            <td className="py-2">
              <span className="flex items-center gap-2 font-semibold text-strong">
                <TeamLogo abbr={abbr} size={22} /> {abbr}
              </span>
            </td>
            {head.map((h, i) => (
              <td key={h} className="py-2 text-center text-muted">
                {lines[i] ?? "–"}
              </td>
            ))}
            <td className="font-display py-2 text-center text-xl text-strong">{total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const quarterName = (p: number) => (p <= 4 ? ["1st", "2nd", "3rd", "4th"][p - 1] + " quarter" : "Overtime");

function ScoringSummary({ game, detail }: { game: ScoreGame; detail: GameDetail }) {
  if (detail.scoring.length === 0) return <p className="text-sm text-muted">No scoring yet.</p>;
  const periods = [...new Set(detail.scoring.map((s) => s.period))];
  return (
    <div className="flex flex-col gap-4">
      {periods.map((p) => (
        <div key={p}>
          <div className="mb-1 text-xs font-semibold text-muted">{quarterName(p)}</div>
          <ul className="divide-y divide-line/50">
            {detail.scoring
              .filter((s) => s.period === p)
              .map((s, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <TeamLogo abbr={s.team} size={24} />
                  <span className="w-8 shrink-0 rounded bg-head px-1 py-0.5 text-center text-[10px] font-bold text-strong">{s.type}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="text-strong">{s.text}</span>
                    <span className="ml-2 text-xs text-muted">{s.clock}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <span className={s.team === game.away ? "font-bold text-strong" : "text-muted"}>{s.away_score}</span>
                    <span className="text-muted">–</span>
                    <span className={s.team === game.home ? "font-bold text-strong" : "text-muted"}>{s.home_score}</span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted">
        Scores shown {game.away}–{game.home}.
      </p>
    </div>
  );
}

function WinProbChart({ game, detail, pHome }: { game: ScoreGame; detail: GameDetail; pHome: number }) {
  const home = teamInfo(game.home);
  const away = teamInfo(game.away);
  const data = detail.win_prob.map((d) => ({ ...d, pct: d.p * 100 }));
  const last = detail.state === "in" ? pHome : (data[data.length - 1]?.p ?? game.p_home);
  const end = Math.max(60, data[data.length - 1]?.t ?? 60);
  if (data.length < 2) return <p className="text-sm text-muted">The chart starts at kickoff.</p>;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span>
          <span className="font-semibold text-strong">{pct(1 - last)}</span> <span className="text-muted">{game.away}</span>
        </span>
        <span className="text-xs text-muted">pregame {game.home} {pct(game.p_home)}</span>
        <span>
          <span className="text-muted">{game.home}</span> <span className="font-semibold text-strong">{pct(last)}</span>
        </span>
      </div>
      <div className="h-44" role="img" aria-label={`Model win probability for ${home.name} through the game, from ${pct(game.p_home)} at kickoff to ${pct(last)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id={`wp-${game.game_id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={home.primary} stopOpacity={0.55} />
                <stop offset="100%" stopColor={home.primary} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" vertical={false} horizontal={false} />
            <XAxis dataKey="t" type="number" domain={[0, end]} ticks={[7.5, 22.5, 37.5, 52.5, ...(end > 60 ? [60 + (end - 60) / 2] : [])]} tickFormatter={(t) => (t < 60 ? `Q${Math.floor(t / 15) + 1}` : "OT")} tick={{ fill: "var(--chart-text)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "var(--chart-text)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <ReferenceLine y={50} stroke="var(--edge)" />
            {[15, 30, 45, ...(end > 60 ? [60] : [])].map((q) => (
              <ReferenceLine key={q} x={q} stroke="var(--chart-grid)" />
            ))}
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                const q = d.t >= 60 ? "OT" : `Q${Math.floor(d.t / 15) + 1}`;
                return (
                  <div className="rounded-md border border-line bg-panel px-3 py-2 text-xs shadow-lg shadow-black/30">
                    <div className="font-semibold text-strong">
                      {game.home} {pct(d.p)} · {game.away} {pct(1 - d.p)}
                    </div>
                    <div className="text-muted">
                      {q} · {game.away} {d.away}–{d.home} {game.home}
                    </div>
                  </div>
                );
              }}
            />
            <Area type="stepAfter" dataKey="pct" stroke={home.primary} strokeWidth={2} fill={`url(#wp-${game.game_id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">
        {home.name} chance to win (above 50%: {game.home} favored, below: {away.name.split(" ").pop()}). From the model&apos;s pregame odds and the score as the game
        went; it ignores who had the ball between scores.
      </p>
    </div>
  );
}

function Leaders({ leaders }: { leaders: GameLeader[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {leaders.map((l) => (
        <li key={l.category} className="flex items-center gap-3">
          <Headshot src={l.headshot} name={l.name} color={l.team ? teamInfo(l.team).primary : "var(--line)"} size={40} />
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-widest text-muted uppercase">
              {l.category === "PASS" ? "Passing" : l.category === "RUSH" ? "Rushing" : "Receiving"}
            </div>
            <div className="truncate text-sm">
              <span className="font-semibold text-strong">{l.name}</span> <span className="text-muted">{l.team}</span>
            </div>
            <div className="text-xs text-muted tabular-nums">{l.line}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function GameInfo({ detail, game }: { detail: Pick<GameDetail, "venue" | "attendance" | "weather" | "broadcast"> | null; game: ScoreGame }) {
  const rows: [string, string][] = [];
  if (game.kickoff) rows.push(["Kickoff", kickoffShort(game.kickoff)]);
  if (detail?.venue) rows.push(["Stadium", detail.venue]);
  if (detail?.broadcast) rows.push(["TV", detail.broadcast]);
  if (detail?.weather) rows.push(["Weather", detail.weather]);
  if (detail?.attendance) rows.push(["Attendance", detail.attendance.toLocaleString("en-US")]);
  if (game.neutral) rows.push(["Site", "Neutral"]);
  if (!rows.length) return null;
  return (
    <Card title="Game info">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-strong">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function BoxScore({ game, detail }: { game: ScoreGame; detail: GameDetail }) {
  const [team, setTeam] = useState<"away" | "home">("away");
  const abbr = team === "home" ? game.home : game.away;
  const cats = team === "home" ? detail.home_box : detail.away_box;
  return (
    <div>
      <div className="inline-flex gap-1 rounded-lg bg-head p-1 ring-1 ring-line" role="group" aria-label="Team">
        {(["away", "home"] as const).map((t) => {
          const a = t === "home" ? game.home : game.away;
          return (
            <button
              key={t}
              onClick={() => setTeam(t)}
              aria-pressed={team === t}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${team === t ? "bg-panel text-strong shadow-sm ring-1 ring-line" : "text-muted hover:text-strong"}`}
            >
              <TeamLogo abbr={a} size={20} /> {teamInfo(a).name}
            </button>
          );
        })}
      </div>
      {cats.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No player stats yet.</p>
      ) : (
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
          {cats.map((c) => (
            <BoxTable key={c.key} cat={c} color={teamInfo(abbr).primary} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoxTable({ cat, color }: { cat: BoxCategory; color: string }) {
  return (
    <section className="overflow-x-auto rounded-lg ring-1 ring-line/70">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-head text-xs text-muted">
          <tr>
            <th className="px-3 py-2 text-left font-semibold tracking-widest text-strong uppercase">{cat.title}</th>
            {cat.labels.map((l) => (
              <th key={l} className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">
          {cat.rows.map((r) => (
            <tr key={r.id || r.name} className="hover:bg-hover">
              <td className="px-3 py-1.5">
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Headshot src={r.headshot} name={r.name} color={color} size={24} />
                  <span className="font-semibold text-strong">{r.name}</span>
                </span>
              </td>
              {r.stats.map((v, i) => (
                <td key={i} className="px-2 py-1.5 text-right whitespace-nowrap">
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {cat.totals && cat.rows.length > 1 && (
            <tr className="bg-head/60 font-semibold">
              <td className="px-3 py-1.5 text-muted">Team</td>
              {cat.totals.map((v, i) => (
                <td key={i} className="px-2 py-1.5 text-right">
                  {v}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

/** The leading number of a stat ("8-18" -> 8, "26:16" -> minutes, "380" -> 380), for the comparison bars. */
function statValue(label: string, v: string | null): number | null {
  if (v == null) return null;
  if (label === "Possession") {
    const [m, s] = v.split(":").map(Number);
    return Number.isFinite(m) ? m + (s || 0) / 60 : null;
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const LOWER_IS_BETTER = new Set(["Turnovers", "Penalties-yards", "Sacks-yards"]);

function TeamStats({ game, detail }: { game: ScoreGame; detail: GameDetail }) {
  if (!detail.team_stats.length) return <p className="text-sm text-muted">No team stats yet.</p>;
  const a = teamInfo(game.away).primary;
  const h = teamInfo(game.home).primary;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-strong">
        <span className="flex items-center gap-2">
          <TeamLogo abbr={game.away} size={24} /> {game.away}
        </span>
        <span className="flex items-center gap-2">
          {game.home} <TeamLogo abbr={game.home} size={24} />
        </span>
      </div>
      <ul className="divide-y divide-line/50">
        {detail.team_stats.map((s) => {
          const av = statValue(s.label, s.away);
          const hv = statValue(s.label, s.home);
          const total = (av ?? 0) + (hv ?? 0);
          const share = total > 0 && av != null && hv != null ? av / total : null;
          const better = av == null || hv == null || av === hv ? null : (av > hv) !== LOWER_IS_BETTER.has(s.label) ? "away" : "home";
          return (
            <li key={s.label} className="py-2.5">
              <div className="flex items-center justify-between text-sm tabular-nums">
                <span className={better === "away" ? "font-bold text-strong" : "text-muted"}>{s.away ?? "–"}</span>
                <span className="text-xs text-muted">{s.label}</span>
                <span className={better === "home" ? "font-bold text-strong" : "text-muted"}>{s.home ?? "–"}</span>
              </div>
              {share != null && (
                <div className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  <div className="h-full rounded-l-full" style={{ width: `${share * 100}%`, backgroundColor: a, opacity: better === "home" ? 0.45 : 1 }} />
                  <div className="h-full flex-1 rounded-r-full" style={{ backgroundColor: h, opacity: better === "away" ? 0.45 : 1 }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- not started ----------

function Matchup({ game, odds, detail }: { game: ScoreGame; odds: Record<string, TeamOdds>; detail: GameDetail | null }) {
  const sides = [game.away, game.home];
  const rec = (o: TeamOdds) => `${o.record.wins}-${o.record.losses}${o.record.ties ? `-${o.record.ties}` : ""}`;
  const rows: { label: string; value: (o: TeamOdds) => string; num: (o: TeamOdds) => number }[] = [
    { label: "Record", value: rec, num: (o) => o.record.wins - o.record.losses },
    { label: "Team rating (Elo)", value: (o) => String(Math.round(o.elo)), num: (o) => o.elo },
    { label: "Expected wins", value: (o) => o.exp_wins.toFixed(1), num: (o) => o.exp_wins },
    { label: "Make playoffs", value: (o) => pct(o.p_playoffs), num: (o) => o.p_playoffs },
    { label: "Win Super Bowl", value: (o) => pct(o.p_super_bowl), num: (o) => o.p_super_bowl },
  ];
  const [oa, oh] = sides.map((t) => odds[t]);
  return (
    <div className="grid items-start gap-4 p-4 sm:p-5 lg:grid-cols-5">
      <Card title="Model prediction" className="lg:col-span-2">
        <div className="flex items-center justify-around gap-4">
          {sides.map((t) => {
            const p = t === game.home ? game.p_home : 1 - game.p_home;
            return (
              <div key={t} className="flex flex-col items-center gap-1">
                <TeamLogo abbr={t} size={56} />
                <span className={`font-display text-4xl tabular-nums ${p >= 0.5 ? "text-strong" : "text-muted"}`}>{pct(p)}</span>
                <span className="text-xs text-muted">{t} win</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex h-2 overflow-hidden rounded-full" aria-hidden>
          <div style={{ width: `${(1 - game.p_home) * 100}%`, backgroundColor: teamInfo(game.away).primary }} />
          <div className="flex-1" style={{ backgroundColor: teamInfo(game.home).primary }} />
        </div>
        <p className="mt-3 text-xs text-muted">From each team&apos;s rating (with its starting QB) and home field.</p>
      </Card>
      <div className="flex flex-col gap-4 lg:col-span-3">
        {oa && oh && (
          <Card title="Tale of the tape">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pb-2 text-left font-semibold">
                    <Link href={`/teams/${game.away}`} className="flex items-center gap-2 text-strong hover:text-accent-ink">
                      <TeamLogo abbr={game.away} size={22} /> {game.away}
                    </Link>
                  </th>
                  <th />
                  <th className="pb-2 text-right font-semibold">
                    <Link href={`/teams/${game.home}`} className="flex items-center justify-end gap-2 text-strong hover:text-accent-ink">
                      {game.home} <TeamLogo abbr={game.home} size={22} />
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {rows.map((r) => {
                  const better = r.num(oa) === r.num(oh) ? null : r.num(oa) > r.num(oh) ? "away" : "home";
                  return (
                    <tr key={r.label}>
                      <td className={`py-2 ${better === "away" ? "font-bold text-strong" : "text-muted"}`}>{r.value(oa)}</td>
                      <td className="py-2 text-center text-xs text-muted">{r.label}</td>
                      <td className={`py-2 text-right ${better === "home" ? "font-bold text-strong" : "text-muted"}`}>{r.value(oh)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-2 text-muted">{oa.qb ?? "–"}</td>
                  <td className="py-2 text-center text-xs text-muted">Starting QB</td>
                  <td className="py-2 text-right text-muted">{oh.qb ?? "–"}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}
        <GameInfo detail={detail} game={game} />
      </div>
    </div>
  );
}
