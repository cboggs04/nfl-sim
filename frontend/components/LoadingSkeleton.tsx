/**
 * The grey placeholder shown while a page's data loads. The API runs on a free host that falls asleep when idle, so the first load
 * can take up to a minute: after a few seconds a message explains that, so it doesn't look broken. (The delay is CSS only.)
 */
export default function LoadingSkeleton({ className = "h-96" }: { className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className={`relative flex items-center justify-center rounded-md bg-panel-2 p-6 ${className}`}>
      <div className="absolute inset-0 animate-pulse rounded-md bg-panel-2" aria-hidden />
      <WakeNote />
    </div>
  );
}

/** "Waking up…" text that fades in after 4 seconds of waiting. */
export function WakeNote() {
  return (
    <div className="wake-note relative max-w-md text-center">
      <div className="font-display text-3xl text-strong">Waking up the simulator…</div>
      <p className="mt-1 text-sm text-muted">The server sleeps when it&apos;s idle, so the first load can take up to a minute. After that it&apos;s fast.</p>
    </div>
  );
}
