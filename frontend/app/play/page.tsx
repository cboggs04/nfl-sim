import PageHeader from "@/components/PageHeader";
import { Suspense } from "react";
import PlayNow from "@/components/PlayNow";
import ResetOnLeave from "@/components/ResetOnLeave";
import { getSeason } from "@/lib/api";

export const metadata = { title: "Play Now · NFL Season Simulator" };

async function Game() {
  const season = await getSeason();
  return <PlayNow teams={season.teams} />;
}

export default function PlayPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <ResetOnLeave>
        <Suspense
          fallback={
            <div>
              <PageHeader
                tight
                title={
                  <>
                    Play <span className="text-accent-ink">Now</span>
                  </>
                }
              />
              <div className="h-96 animate-pulse bg-panel-2" aria-busy="true" />
            </div>
          }
        >
          <Game />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
