import Link from "next/link";

export const metadata = { title: "Offline · NFL Season Simulator" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="font-display text-6xl text-strong">You&apos;re offline</h1>
      <p className="mt-3 text-muted">The simulator needs a connection to load the latest numbers. Check your signal and try again.</p>
      <Link href="/play" className="btn btn-primary mt-6 text-xl">
        Try again
      </Link>
    </main>
  );
}
