import { Suspense } from "react";
import WhatIfSandbox from "@/components/WhatIfSandbox";
import { getSeason } from "@/lib/api";

export const metadata = { title: "What-if Sandbox · NFL Season Simulator" };

async function Sandbox() {
  const season = await getSeason();
  return <WhatIfSandbox baseline={season.teams} />;
}

export default function WhatIfPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-6xl text-strong sm:text-8xl">
        What-if <span className="text-accent-ink">Sandbox</span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Change the world and re-run the season. Boost a team (say they signed a star quarterback), hurt one, or force the result
        of a game, then see how every team&apos;s playoff and Super Bowl odds move.
      </p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-96 animate-pulse bg-panel-2" aria-busy="true" />}>
          <Sandbox />
        </Suspense>
      </div>
    </main>
  );
}
