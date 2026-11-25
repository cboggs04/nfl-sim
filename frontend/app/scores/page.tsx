import LoadingSkeleton from "@/components/LoadingSkeleton";
import PageHeader from "@/components/PageHeader";
import ResetOnLeave from "@/components/ResetOnLeave";
import ScoresBoard from "@/components/ScoresBoard";
import { Suspense } from "react";
import { getGames } from "@/lib/api";

export const metadata = { title: "Scores · NFL Season Simulator" };

async function Board({ searchParams }: { searchParams: PageProps<"/scores">["searchParams"] }) {
  const [data, params] = await Promise.all([getGames().catch(() => null), searchParams]);
  if (!data) {
    return <p className="mt-8 text-muted">Scores aren&apos;t available right now. The server may still be waking up: wait a few seconds and reload.</p>;
  }
  const raw = Array.isArray(params.week) ? params.week[0] : params.week; // ?week=7 opens that week
  const week = Number(raw) || data.current_week;
  return <ScoresBoard key={week} data={data} initialWeek={week} />;
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
          subtitle="This week's games with live scores and live win probability while they're on. Pick another week to see past results (and whether the model called them) or what's coming up."
        />
        <Suspense fallback={<LoadingSkeleton />}>
          <Board searchParams={props.searchParams} />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
