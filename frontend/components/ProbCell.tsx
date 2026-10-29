export const pct = (p: number) =>
  p === 0 ? "0%" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`;

/** A table cell showing a percentage with a thin bar behind it. The number is always shown. */
export default function ProbCell({ p }: { p: number }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <div className="relative ml-auto h-6 w-24">
        <div
          className="absolute inset-y-1 left-0 rounded-sm bg-sky-500/25 dark:bg-sky-400/25"
          style={{ width: `${Math.max(p * 100, p > 0 ? 2 : 0)}%` }}
        />
        <span className="relative flex h-full items-center justify-end pr-1">{pct(p)}</span>
      </div>
    </td>
  );
}
