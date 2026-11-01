import { Suspense } from "react";
import ContenderCards from "@/components/ContenderCards";
import DashboardTabs from "@/components/DashboardTabs";
import LeadersView from "@/components/LeadersView";
import SeasonTable from "@/components/SeasonTable";
import { getLeaders, getSeason } from "@/lib/api";

async function Dashboard() {
  const [season, leaders] = await Promise.all([getSeason(), getLeaders().catch(() => null)]);
  const updated = new Date(season.generated_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const progress = Math.round((season.games_played / season.games_total) * 100);
  return (
    <DashboardTabs
      eyebrow={`${season.season} season`}
      intro={
        <>
          <div className="mt-4 flex max-w-xl items-center gap-3 text-sm text-muted">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${progress}% of the season played`}>
              <div className="h-full rounded-full bg-gradient-to-r from-[#1d4f9e] to-accent" style={{ width: `${progress}%` }} />
            </div>
            <span className="tabular-nums">
              {season.games_played} of {season.games_total} games played
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Based on {season.n_sims.toLocaleString("en-US")} simulated seasons · updated {updated}
          </p>
        </>
      }
      tabs={[
        {
          key: "teams",
          label: "Teams",
          title: ["Super Bowl", "Odds"],
          content: (
            <>
              <section className="mt-8" aria-label="Super Bowl favorites">
                <ContenderCards teams={season.teams} />
              </section>
              <section className="mt-12">
                <h2 className="font-display mb-4 text-4xl text-strong">League board</h2>
                <SeasonTable teams={season.teams} />
              </section>
            </>
          ),
        },
        {
          key: "overall",
          label: "Overall",
          title: ["League", "Leaders"],
          content: leaders ? (
            <LeadersView data={leaders} />
          ) : (
            <p className="mt-8 text-muted">Leaders data isn&apos;t available. Is the API running, and has `python -m scripts.precompute` been run?</p>
          ),
        },
      ]}
    />
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
