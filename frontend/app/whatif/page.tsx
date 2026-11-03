import LoadingSkeleton from "@/components/LoadingSkeleton";
import PageHeader from "@/components/PageHeader";
import ResetOnLeave from "@/components/ResetOnLeave";
import { Suspense } from "react";
import WhatIfSandbox from "@/components/WhatIfSandbox";
import { getSeason } from "@/lib/api";

export const metadata = { title: "What-if Sandbox · NFL Season Simulator" };

async function Sandbox({ searchParams }: { searchParams: PageProps<"/whatif">["searchParams"] }) {
  const [season, params] = await Promise.all([getSeason(), searchParams]);
  const team = Array.isArray(params.team) ? params.team[0] : params.team; // a team page links here with ?team=BUF
  return <WhatIfSandbox baseline={season.teams} initialTeam={team} />;
}

export default function WhatIfPage(props: PageProps<"/whatif">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 land:py-3 sm:px-6">
      <ResetOnLeave>
        <PageHeader
          title={
            <>
              What-if <span className="text-accent-ink">Sandbox</span>
            </>
          }
          subtitle="Change the world and re-run the season. Boost a team (say they signed a star quarterback), hurt one, or force the result of a game, then see how every team's playoff and Super Bowl odds move."
        />
        <Suspense fallback={<LoadingSkeleton />}>
          <Sandbox searchParams={props.searchParams} />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
