/** A small play triangle for Replay buttons (drawn, so it never wraps onto its own line or overlaps the label). */
export default function PlayIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor" aria-hidden className="shrink-0">
      <path d="M1.5 0.8v8.4L9 5z" />
    </svg>
  );
}
