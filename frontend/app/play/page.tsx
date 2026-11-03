import PageHeader from "@/components/PageHeader";
import { Suspense } from "react";
import PlayNow from "@/components/PlayNow";
import ResetOnLeave from "@/components/ResetOnLeave";
import { getSeason } from "@/lib/api";

export const metadata = { title: "Play Now · NFL Season Simulator" };

async function Game({ searchParams }: { searchParams: PageProps<"/play">["searchParams"] }) {
  const [season, params] = await Promise.all([getSeason(), searchParams]);
  const team = Array.isArray(params.team) ? params.team[0] : params.team; // a team page links here with ?team=BUF
  return <PlayNow teams={season.teams} initialTeam={team} />;
}

export default function PlayPage(props: PageProps<"/play">) {
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
          <Game searchParams={props.searchParams} />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
