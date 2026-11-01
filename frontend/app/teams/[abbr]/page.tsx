import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ColumnChart from "@/components/ColumnChart";
import ProbCell, { pct } from "@/components/ProbCell";
import ResetOnLeave from "@/components/ResetOnLeave";
import SeasonSimulator from "@/components/SeasonSimulator";
import TeamTabs from "@/components/TeamTabs";
import TeamLogo from "@/components/TeamLogo";
import { getRoster, getTeam } from "@/lib/api";
import { logoSrc, teamInfo } from "@/lib/teams";
import type { GameView } from "@/lib/types";

function Tile({ label, value, ratio, color }: { label: string; value: string; ratio: number; color: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs font-semibold tracking-widest text-muted uppercase">{label}</div>
      <div className="font-display mt-1 text-5xl text-strong">{value}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gauge" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/** Describe an unplayed game in words instead of a hard W/L: even a 70% favorite loses 3 times in 10. */
function tier(p: number) {
  if (p >= 0.7) return { label: "Likely win", style: "bg-good/25 text-good-ink ring-1 ring-good/50" };
  if (p >= 0.55) return { label: "Lean win", style: "bg-good/12 text-good-ink ring-1 ring-good/25" };
  if (p > 0.45) return { label: "Toss-up", style: "bg-head text-strong ring-1 ring-line" };
  if (p > 0.3) return { label: "Lean loss", style: "bg-bad/12 text-bad-ink ring-1 ring-bad/25" };
  return { label: "Likely loss", style: "bg-bad/25 text-bad-ink ring-1 ring-bad/50" };
}

function ResultCell({ g }: { g: GameView }) {
  if (g.played) {
    return (
      <span className="inline-flex items-center gap-3">
        <span
          className={`font-display inline-flex h-9 w-9 items-center justify-center rounded text-xl text-white ${
            g.result === "W" ? "bg-good" : g.result === "L" ? "bg-bad" : "bg-zinc-500"
          }`}
          aria-label={g.result === "W" ? "Win" : g.result === "L" ? "Loss" : "Tie"}
        >
          {g.result}
        </span>
        <span className="text-base font-semibold tabular-nums">
          {g.team_score}–{g.opp_score}
        </span>
      </span>
    );
  }
  const t = tier(g.p_win ?? 0.5);
  return <span className={`inline-block rounded px-3 py-1.5 text-sm font-semibold ${t.style}`}>{t.label}</span>;
}

/** Smallest win total at which the cumulative probability reaches q. */
function quantile(dist: number[], q: number) {
  let cum = 0;
  for (let w = 0; w < dist.length; w++) {
    cum += dist[w];
    if (cum >= q - 1e-9) return w;
  }
  return dist.length - 1;
}

async function TeamContent({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params;
  const [team, roster] = await Promise.all([getTeam(abbr), getRoster(abbr).catch(() => null)]);
  if (!team) notFound();
  const { odds, games } = team;
  const info = teamInfo(odds.team);
  const rec = (w: number, l: number, t = 0) => `${w}-${l}${t ? `-${t}` : ""}`;
  const remaining = games.filter((g) => !g.played);

  // Most likely finish = the single most common win total across the simulations.
  const modeWins = odds.win_dist.indexOf(Math.max(...odds.win_dist));
  const modeProb = odds.win_dist[modeWins];
  const lo = quantile(odds.win_dist, 0.1);
  const hi = quantile(odds.win_dist, 0.9);
  const gamesTotal = odds.record.wins + odds.record.losses + odds.record.ties + remaining.length;
  const likelyRecord = rec(modeWins, gamesTotal - modeWins - odds.record.ties, odds.record.ties);
  const expectedMore = remaining.reduce((sum, g) => sum + (g.p_win ?? 0), 0);

  const winData = odds.win_dist.map((p, w) => ({ label: String(w), value: p }));
  const seedData = [
    ...team.seed_dist.map((p, i) => ({ label: `#${i + 1}`, value: p })),
    { label: "Out", value: Math.max(0, 1 - odds.p_playoffs) },
  ];

  return (
    <>
      <Link href="/" className="text-sm font-semibold tracking-widest text-muted uppercase hover:text-strong">
        ← All teams
      </Link>

      <header
        className="panel relative mt-4 overflow-hidden"
        style={{ backgroundColor: "var(--card-end)", backgroundImage: `linear-gradient(120deg, ${info.primary}ee 0%, ${info.primary}55 45%, var(--card-end) 100%)` }}
      >
        <Image
          src={logoSrc(odds.team)}
          alt=""
          width={520}
          height={520}
          aria-hidden
          className="pointer-events-none absolute -right-16 -bottom-24 hidden h-[420px] w-[420px] rotate-[-8deg] opacity-[0.16] md:block"
        />
        <div className="relative flex flex-col gap-8 p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <TeamLogo abbr={odds.team} size={176} />
            <div>
              <div className="text-sm font-semibold tracking-[0.25em] text-white/80 uppercase">{odds.division}</div>
              <h1 className="font-display mt-1 text-6xl text-white [text-shadow:0_3px_14px_rgba(0,0,0,.55)] sm:text-7xl">{odds.name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="font-display bg-black/45 px-4 py-1 text-4xl text-white tabular-nums">
                  {rec(odds.record.wins, odds.record.losses, odds.record.ties)}
                </span>
                <span className="bg-black/30 px-3 py-1.5 text-sm font-semibold text-white/85">
                  {remaining.length} games left
                </span>
                <span className="bg-black/30 px-3 py-1.5 text-sm font-semibold text-white/85">Rating {Math.round(odds.elo)}</span>
                {odds.qb && (
                  <span className="bg-black/30 px-3 py-1.5 text-sm font-semibold text-white/85" title="Projected starting quarterback and the Elo points he adds to the team's rating">
                    QB {odds.qb} · {(odds.qb_adj ?? 0) >= 0 ? "+" : "−"}
                    {Math.abs(Math.round(odds.qb_adj ?? 0))}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="bg-black/45 px-7 py-5 text-left ring-1 ring-white/15 backdrop-blur lg:text-right">
            <div className="text-xs font-semibold tracking-widest text-white/70 uppercase">Most likely finish</div>
            <div className="font-display text-7xl text-white tabular-nums">{likelyRecord}</div>
            <div className="text-xs text-white/75">
              happens in {pct(modeProb)} of simulations
              <br />
              80% of seasons end with {lo}–{hi} wins
            </div>
          </div>
        </div>
      </header>

      
        <ResetOnLeave>
        <TeamTabs
          key={odds.team} // a fresh page every time: always opens on Overview
          overview={
            <>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Expected wins" value={odds.exp_wins.toFixed(1)} ratio={odds.exp_wins / 17} color={info.primary} />
        <Tile label="Win division" value={pct(odds.p_division)} ratio={odds.p_division} color={info.primary} />
        <Tile label="Make playoffs" value={pct(odds.p_playoffs)} ratio={odds.p_playoffs} color={info.primary} />
        <Tile label="Conf. final" value={pct(team.p_conference_round)} ratio={team.p_conference_round} color={info.primary} />
        <Tile label="Super Bowl" value={pct(odds.p_conference)} ratio={odds.p_conference} color={info.primary} />
        <Tile label="Win it all" value={pct(odds.p_super_bowl)} ratio={odds.p_super_bowl} color="var(--accent)" />
      </div>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-4xl text-strong">Schedule &amp; outlook</h2>
          <p className="text-sm text-muted">
            {remaining.length > 0
              ? `Expected ${expectedMore.toFixed(1)} more wins from ${remaining.length} remaining games`
              : "Season complete"}
          </p>
        </div>
        <div className="panel-flat overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-line bg-head text-xs tracking-widest text-muted uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Week</th>
                <th className="px-3 py-3 text-left font-semibold">Opponent</th>
                <th className="px-3 py-3 text-left font-semibold">Result / outlook</th>
                <th className="px-3 py-3 text-right font-semibold">Win probability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {games.map((g) => (
                <tr key={g.game_id} className={`transition-colors hover:bg-hover ${g.played ? "" : "bg-rowtint"}`}>
                  <td className="font-display px-4 py-2 text-2xl text-muted tabular-nums">{g.week}</td>
                  <td className="px-3 py-2">
                    <Link href={`/teams/${g.opponent}`} className="group flex items-center gap-4">
                      <TeamLogo abbr={g.opponent} size={48} />
                      <span className="text-base font-semibold text-strong group-hover:text-accent-ink">
                        <span className="mr-2 text-sm font-normal text-muted">{g.neutral || g.home ? "vs" : "@"}</span>
                        {teamInfo(g.opponent).name}
                        {g.neutral && <span className="ml-2 text-xs font-normal text-muted">neutral site</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <ResultCell g={g} />
                  </td>
                  {g.p_win != null ? <ProbCell p={g.p_win} /> : <td className="px-3 py-2 text-right text-muted">—</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <ColumnChart
          title="Final win total"
          subtitle="Share of simulated seasons ending with each number of wins"
          data={winData}
          xLabel="Wins"
        />
        <ColumnChart
          title="Playoff seed"
          subtitle="Share of simulated seasons ending at each seed, or missing the playoffs"
          data={seedData}
          xLabel="Seed"
        />
      </div>
            </>
          }
          simulator={
            roster ? (
              <SeasonSimulator roster={roster} color={info.primary} wins={odds.record.wins} losses={odds.record.losses} ties={odds.record.ties} likelyWins={modeWins} />
            ) : (
              <p className="mt-6 text-muted">Simulator data isn&apos;t available. Is the API running, and has `python -m scripts.precompute` been run?</p>
            )
          }
        />
        </ResetOnLeave>
    </>
  );
}

export default function TeamPage(props: PageProps<"/teams/[abbr]">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse bg-panel-2" aria-busy="true" />}>
        <TeamContent params={props.params} />
      </Suspense>
    </main>
  );
}
