import ResetOnLeave from "@/components/ResetOnLeave";
import { Suspense } from "react";
import ContenderCards from "@/components/ContenderCards";
import FeatureCards from "@/components/FeatureCards";
import { WakeNote } from "@/components/LoadingSkeleton";
import PageHeader from "@/components/PageHeader";
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
      <PageHeader
        title={
          <>
            NFL Season <span className="text-accent-ink">Simulator</span>
          </>
        }
        subtitle={`Simulates the NFL season ${season.n_sims.toLocaleString("en-US")} times to project every team's record, playoff odds and Super Bowl chances. Explore the what-ifs, check the stat leaders, or play a game.`}
      />

      <section aria-label="What you can do here">
        <FeatureCards />
      </section>

      <section className="mt-10" aria-label="Super Bowl favorites">
        <div className="text-sm font-semibold tracking-[0.25em] text-accent-ink uppercase">{season.season} season</div>
        <h2 className="font-display text-4xl text-strong">Super Bowl odds</h2>
        <div className="mt-2 flex max-w-xl items-center gap-3 text-sm text-muted">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${progress}% of the season played`}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#1d4f9e] to-accent" style={{ width: `${progress}%` }} />
          </div>
          <span className="tabular-nums">
            {season.games_played} of {season.games_total} games played
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">Updated {updated}</p>
        <div className="mt-4">
          <ContenderCards teams={season.teams} />
        </div>
      </section>

      <section id="league-board" className="mt-12 scroll-mt-20">
        <h2 className="font-display mb-4 text-4xl text-strong">League board</h2>
        <SeasonTable teams={season.teams} />
      </section>
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading season data">
      <div className="animate-pulse">
        <div className="h-24 w-96 max-w-full rounded bg-panel-2" />
      </div>
      <div className="mt-4">
        <WakeNote />
      </div>
      <div className="mt-8 grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
      <ResetOnLeave>
        <Suspense fallback={<Skeleton />}>
          <Dashboard />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
