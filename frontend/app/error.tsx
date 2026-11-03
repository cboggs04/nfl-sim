"use client";

/** Shown when a page's data can't be loaded (usually the free API server still waking up). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="font-display text-5xl text-strong">Couldn&apos;t reach the simulator</h1>
      <p className="mt-3 text-muted">
        The server that runs the simulations may still be waking up (it sleeps when idle and can take up to a minute). Wait a few seconds and try again.
      </p>
      <button onClick={reset} className="btn btn-primary mt-6 text-xl">
        Try again
      </button>
    </main>
  );
}
