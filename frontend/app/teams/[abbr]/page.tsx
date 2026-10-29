import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ColumnChart from "@/components/ColumnChart";
import ProbCell, { pct } from "@/components/ProbCell";
import TeamLogo from "@/components/TeamLogo";
import { getTeam } from "@/lib/api";
import { teamInfo } from "@/lib/teams";
import type { GameView } from "@/lib/types";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{value}</div>
    </div>
  );
}

/** The model's pick for a game: the more likely outcome, flagged if it's nearly a coin flip. */
function pickFor(g: GameView) {
  const p = g.p_win ?? 0.5;
  return { result: p >= 0.5 ? "W" : "L", confidence: Math.max(p, 1 - p), tossUp: Math.abs(p - 0.5) < 0.05 };
}

function ResultPill({ g }: { g: GameView }) {
  if (g.played) {
    const win = g.result === "W";
    return (
      <span className="inline-flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white ${
            win ? "bg-emerald-600" : g.result === "L" ? "bg-rose-600" : "bg-zinc-500"
          }`}
          aria-label={win ? "Win" : g.result === "L" ? "Loss" : "Tie"}
        >
          {g.result}
        </span>
        <span className="tabular-nums">
          {g.team_score}–{g.opp_score}
        </span>
      </span>
    );
  }
  const pick = pickFor(g);
  const win = pick.result === "W";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed text-sm font-bold ${
          win
            ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
            : "border-rose-600 text-rose-700 dark:border-rose-400 dark:text-rose-400"
        }`}
        aria-label={`Predicted ${win ? "win" : "loss"}`}
      >
        {pick.result}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{pick.tossUp ? "Toss-up" : `${pct(pick.confidence)} confident`}</span>
    </span>
  );
}

async function TeamContent({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params;
  const team = await getTeam(abbr);
  if (!team) notFound();
  const { odds, games } = team;
  const info = teamInfo(odds.team);
  const rec = (w: number, l: number, t = 0) => `${w}-${l}${t ? `-${t}` : ""}`;
  const remaining = games.filter((g) => !g.played);

  // "Projected record" = current record + the favorite winning every remaining game.
  const pickedWins = remaining.filter((g) => pickFor(g).result === "W").length;
  const projected = rec(odds.record.wins + pickedWins, odds.record.losses + remaining.length - pickedWins, odds.record.ties);

  const winData = odds.win_dist.map((p, w) => ({ label: String(w), value: p }));
  const seedData = [
    ...team.seed_dist.map((p, i) => ({ label: `#${i + 1}`, value: p })),
    { label: "Out", value: Math.max(0, 1 - odds.p_playoffs) },
  ];

  return (
    <>
      <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← All teams
      </Link>

      <header
        className="relative mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
        style={{ backgroundImage: `linear-gradient(120deg, ${info.primary}2e, transparent 55%)` }}
      >
        <div className="h-1.5 w-full" style={{ backgroundColor: info.primary }} />
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-5">
            <TeamLogo abbr={odds.team} size={88} />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{odds.name}</h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {odds.division} · Elo {Math.round(odds.elo)}
              </p>
              <p className="mt-2 text-lg font-medium tabular-nums">
                {rec(odds.record.wins, odds.record.losses, odds.record.ties)}
                <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">{remaining.length} games left</span>
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-white/70 px-5 py-3 text-left shadow-sm ring-1 ring-zinc-200 backdrop-blur sm:text-right dark:bg-zinc-900/70 dark:ring-zinc-700">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Projected record</div>
            <div className="text-3xl font-semibold tabular-nums">{projected}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              if the favorite wins every game · avg. {odds.exp_wins.toFixed(1)} wins
            </div>
          </div>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Expected wins" value={odds.exp_wins.toFixed(1)} />
        <Tile label="Win division" value={pct(odds.p_division)} />
        <Tile label="Make playoffs" value={pct(odds.p_playoffs)} />
        <Tile label="Reach conf. final" value={pct(team.p_conference_round)} />
        <Tile label="Reach Super Bowl" value={pct(odds.p_conference)} />
        <Tile label="Win Super Bowl" value={pct(odds.p_super_bowl)} />
      </div>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Schedule &amp; predictions</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Solid = final · dashed = predicted (the more likely outcome)
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Week</th>
                <th className="px-3 py-2 text-left font-semibold">Opponent</th>
                <th className="px-3 py-2 text-left font-semibold">Result / prediction</th>
                <th className="px-3 py-2 text-right font-semibold">Win probability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {games.map((g) => (
                <tr key={g.game_id} className={g.played ? "" : "bg-zinc-50/50 dark:bg-zinc-900/30"}>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">{g.week}</td>
                  <td className="px-3 py-2">
                    <Link href={`/teams/${g.opponent}`} className="flex items-center gap-3 hover:underline">
                      <TeamLogo abbr={g.opponent} size={30} />
                      <span>
                        <span className="mr-1.5 text-zinc-400">{g.neutral || g.home ? "vs" : "@"}</span>
                        {teamInfo(g.opponent).name}
                        {g.neutral && <span className="ml-1.5 text-xs text-zinc-400">neutral site</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <ResultPill g={g} />
                  </td>
                  {g.p_win != null ? <ProbCell p={g.p_win} /> : <td className="px-3 py-2 text-right text-zinc-400">—</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
  );
}

export default function TeamPage(props: PageProps<"/teams/[abbr]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" aria-busy="true" />}>
        <TeamContent params={props.params} />
      </Suspense>
    </main>
  );
}
