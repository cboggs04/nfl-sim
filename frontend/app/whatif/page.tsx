import PageHeader from "@/components/PageHeader";
import ResetOnLeave from "@/components/ResetOnLeave";
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
      <ResetOnLeave>
        <PageHeader
          title={
            <>
              What-if <span className="text-accent-ink">Sandbox</span>
            </>
          }
          subtitle="Change the world and re-run the season. Boost a team (say they signed a star quarterback), hurt one, or force the result of a game, then see how every team's playoff and Super Bowl odds move."
        />
        <Suspense fallback={<div className="h-96 animate-pulse bg-panel-2" aria-busy="true" />}>
          <Sandbox />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
