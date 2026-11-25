import LoadingSkeleton from "@/components/LoadingSkeleton";
import GameView from "@/components/GameView";
import ResetOnLeave from "@/components/ResetOnLeave";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getGames, getSeason } from "@/lib/api";

export const metadata = { title: "Game · NFL Season Simulator" };

async function Game({ params }: { params: PageProps<"/scores/[gameId]">["params"] }) {
  const { gameId } = await params;
  const [data, season] = await Promise.all([getGames().catch(() => null), getSeason().catch(() => null)]);
  if (!data) {
    return <p className="mt-8 text-muted">This game isn&apos;t available right now. The server may still be waking up: wait a few seconds and reload.</p>;
  }
  const game = data.games.find((g) => g.game_id === gameId);
  if (!game) notFound();
  return <GameView key={game.game_id} game={game} teams={season?.teams ?? []} currentWeek={data.current_week} />;
}

export default function GamePage(props: PageProps<"/scores/[gameId]">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <ResetOnLeave>
        <Suspense fallback={<LoadingSkeleton />}>
          <Game params={props.params} />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
