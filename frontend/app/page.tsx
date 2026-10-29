import { Suspense } from "react";
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
  return (
    <>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {season.season} season · {season.games_played} of {season.games_total} games played ·{" "}
        {season.n_sims.toLocaleString("en-US")} simulations · updated {updated}
      </p>
      <div className="mt-6">
        <SeasonTable teams={season.teams} />
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-2" aria-busy="true" aria-label="Loading season data">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="h-11 rounded bg-zinc-100 dark:bg-zinc-900" />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">NFL Season Simulator</h1>
      <Suspense fallback={<Skeleton />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
