import BracketSim from "@/components/BracketSim";

export const metadata = { title: "Playoff Simulator · NFL Season Simulator" };

export default function BracketPage() {
  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-10 sm:px-6">
      <h1 className="font-display text-6xl text-white sm:text-8xl">
        Playoff <span className="text-accent">Simulator</span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Play out the rest of the season once, see the bracket it creates, then play each playoff game yourself. Every game
        is decided by the model&apos;s win probability, so it comes out differently each time.
      </p>
      <div className="mt-6">
        <BracketSim />
      </div>
    </main>
  );
}
