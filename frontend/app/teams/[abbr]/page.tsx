import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ColumnChart from "@/components/ColumnChart";
import ProbCell, { pct } from "@/components/ProbCell";
import { getTeam } from "@/lib/api";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{value}</div>
    </div>
  );
}

async function TeamContent({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params;
  const team = await getTeam(abbr);
  if (!team) notFound();
  const { odds, games } = team;
  const rec = `${odds.record.wins}-${odds.record.losses}${odds.record.ties ? `-${odds.record.ties}` : ""}`;
  const remaining = games.filter((g) => !g.played);

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
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{odds.name}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {odds.division} · {rec} · Elo {Math.round(odds.elo)} · {remaining.length} games left
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Expected wins" value={odds.exp_wins.toFixed(1)} />
        <Tile label="Win division" value={pct(odds.p_division)} />
        <Tile label="Make playoffs" value={pct(odds.p_playoffs)} />
        <Tile label="Reach conf. final" value={pct(team.p_conference_round)} />
        <Tile label="Reach Super Bowl" value={pct(odds.p_conference)} />
        <Tile label="Win Super Bowl" value={pct(odds.p_super_bowl)} />
      </div>

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

      <section className="mt-6">
        <h2 className="mb-2 font-semibold">Schedule</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Week</th>
                <th className="px-3 py-2 text-left font-semibold">Opponent</th>
                <th className="px-3 py-2 text-right font-semibold">Result</th>
                <th className="px-3 py-2 text-right font-semibold">Win probability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {games.map((g) => (
                <tr key={g.game_id}>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">{g.week}</td>
                  <td className="px-3 py-2">
                    <span className="mr-1.5 text-zinc-400">{g.neutral ? "vs" : g.home ? "vs" : "@"}</span>
                    <Link href={`/teams/${g.opponent}`} className="hover:underline">
                      {g.opponent}
                    </Link>
                    {g.neutral && <span className="ml-1.5 text-xs text-zinc-400">neutral site</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.played ? (
                      <>
                        <span className="mr-2 font-semibold">{g.result}</span>
                        {g.team_score}-{g.opp_score}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  {g.p_win != null ? <ProbCell p={g.p_win} /> : <td className="px-3 py-2 text-right text-zinc-400">—</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
