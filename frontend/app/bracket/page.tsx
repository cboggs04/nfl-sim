import LoadingSkeleton from "@/components/LoadingSkeleton";
import PageHeader from "@/components/PageHeader";
import ResetOnLeave from "@/components/ResetOnLeave";
import { Suspense } from "react";
import BracketSim from "@/components/BracketSim";
import { PlayoffSimProvider } from "@/components/PlayoffSim";
import Standings from "@/components/Standings";
import Tabs from "@/components/Tabs";
import { getBracket, getSeason } from "@/lib/api";

export const metadata = { title: "Playoff Simulator · NFL Season Simulator" };

async function PlayoffTabs() {
  const [season, bracket] = await Promise.all([getSeason(), getBracket().catch(() => null)]);
  return (
    <PlayoffSimProvider>
      <Tabs
      label="Playoff simulator sections"
      idPrefix="playoff"
      tabs={[
        {
          key: "standings",
          label: "Standings",
          content: <Standings teams={season.teams} bracket={bracket} />,
        },
        {
          key: "bracket",
          label: "Bracket",
          content: (
            <>
              <p className="mt-6 max-w-2xl text-sm text-muted">
                Play out the rest of the season once, see the bracket it creates, then play each playoff game yourself. Every game
                is decided by the model&apos;s win probability, so it comes out differently each time.
              </p>
              <div className="mt-6">
                <BracketSim />
              </div>
            </>
          ),
        },
      ]}
      />
    </PlayoffSimProvider>
  );
}

export default function BracketPage() {
  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-10 sm:px-6">
      <ResetOnLeave>
        <PageHeader
          title={
            <>
              Playoff <span className="text-accent-ink">Simulator</span>
            </>
          }
          subtitle="Play out the rest of the season, see the standings it produces, then play the playoffs round by round."
        />
        <Suspense fallback={<LoadingSkeleton />}>
          <PlayoffTabs />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
