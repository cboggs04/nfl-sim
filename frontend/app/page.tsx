import { Suspense } from "react";
import ContenderCards from "@/components/ContenderCards";
import SeasonTable from "@/components/SeasonTable";
import { getSeason } from "@/lib/api";

async function Dashboard() {
  const season = await getSeason();
  const updated = new Date(season.generated_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const progress = Math.round((season.games_played / season.games_total) * 100);
  return (
    <>
      <header className="rise">
        <div className="text-sm font-semibold tracking-[0.25em] text-accent uppercase">{season.season} season</div>
        <h1 className="font-display mt-1 text-6xl text-white sm:text-8xl">
          Title <span className="text-accent">Odds</span>
        </h1>
        <div className="mt-4 flex max-w-xl items-center gap-3 text-sm text-muted">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${progress}% of the season played`}>
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#ffe08a]" style={{ width: `${progress}%` }} />
          </div>
          <span className="tabular-nums">
            {season.games_played} of {season.games_total} games played
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Based on {season.n_sims.toLocaleString("en-US")} simulated seasons · updated {updated}
        </p>
      </header>

      <section className="mt-8" aria-label="Super Bowl favorites">
        <ContenderCards teams={season.teams} />
      </section>

      <section className="mt-12">
        <h2 className="font-display mb-4 text-4xl text-white">League board</h2>
        <SeasonTable teams={season.teams} />
      </section>
    </>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading season data">
      <div className="h-24 w-96 max-w-full rounded bg-panel-2" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-72 rounded bg-panel-2" />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
