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
        <h1 className="font-display text-5xl text-strong sm:text-8xl">
          Play <span className="text-accent-ink">Now</span>
        </h1>
        <Suspense fallback={<div className="mt-6 h-96 animate-pulse bg-panel-2" aria-busy="true" />}>
          <Game />
        </Suspense>
      </ResetOnLeave>
    </main>
  );
}
