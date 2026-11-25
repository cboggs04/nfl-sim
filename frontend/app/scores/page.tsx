import LoadingSkeleton from "@/components/LoadingSkeleton";
import PageHeader from "@/components/PageHeader";
import ResetOnLeave from "@/components/ResetOnLeave";
import ScoresBoard from "@/components/ScoresBoard";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getGames, getSeason } from "@/lib/api";

export const metadata = { title: "Scores · NFL Season Simulator" };

async function Board({ searchParams }: { searchParams: PageProps<"/scores">["searchParams"] }) {
  const [data, season, params] = await Promise.all([getGames().catch(() => null), getSeason().catch(() => null), searchParams]);
  if (!data) {
    return <p className="mt-8 text-muted">Scores aren&apos;t available right now. The server may still be waking up: wait a few seconds and reload.</p>;
  }
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const week = Number(first(params.week)) || data.current_week; // ?week=7 opens that week
  const game = first(params.game);
  if (game && /^[\w-]+$/.test(game)) redirect(`/scores/${game}`); // older ?game=<id> links: each game has its own page now
  return <ScoresBoard key={week} data={data} teams={season?.teams ?? []} initialWeek={week} />;
}

export default function ScoresPage(props: PageProps<"/scores">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 land:py-3 sm:px-6">
      <ResetOnLeave>
        <PageHeader
          title={
            <>
              Scores &amp; <span className="text-accent-ink">Schedule</span>
            </>
          }
          subtitle="Every game with live scores and the model's win probability. Click a game for the box score, scoring summary and team stats."
        />
        <Suspense fallback={<LoadingSkeleton />}>
          <Board searchParams={props.searchParams} />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
