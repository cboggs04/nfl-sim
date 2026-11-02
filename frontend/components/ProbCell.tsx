export const pct = (p: number) =>
  p === 0 ? "0%" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`;

/** A table cell showing a percentage with a bar behind it. The number is always shown. */
export default function ProbCell({ p, className = "" }: { p: number; className?: string }) {
  return (
    <td className={`px-1.5 py-2 text-right tabular-nums md:px-3 ${className}`}>
      <div className="relative ml-auto h-8 w-9 md:w-28">
        <div
          className="absolute inset-y-1.5 left-0 hidden rounded-sm bg-gradient-to-r from-blue/15 to-blue/55 md:block"
          style={{ width: `${Math.max(p * 100, p > 0 ? 2 : 0)}%` }}
        />
        <span className="relative flex h-full items-center justify-end text-base font-semibold md:pr-1.5">{pct(p)}</span>
      </div>
    </td>
  );
}
