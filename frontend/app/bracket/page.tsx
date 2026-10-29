import BracketSim from "@/components/BracketSim";

export const metadata = { title: "Playoff Simulator · NFL Season Simulator" };

export default function BracketPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Playoff simulator</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
        Play out the rest of the season once, see the bracket it creates, then play each playoff game yourself. Every game
        is decided by the model&apos;s win probability, so it comes out differently each time.
      </p>
      <div className="mt-6">
        <BracketSim />
      </div>
    </main>
  );
}
