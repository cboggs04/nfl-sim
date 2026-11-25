export const pct = (p: number) =>
  p === 0 ? "0%" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`;

/** A table cell showing a percentage with a bar behind it. The number is always shown. `narrow`: a shorter bar on phones. */
export default function ProbCell({ p, className = "", narrow = false }: { p: number; className?: string; narrow?: boolean }) {
  return (
    <td className={`py-2 text-right tabular-nums md:px-3 ${narrow ? "px-1.5" : "px-2"} ${className}`}>
      <div className={`relative ml-auto h-8 md:w-28 ${narrow ? "w-12 min-[390px]:w-14 sm:w-24" : "w-24"}`}>
        <div
          className="absolute inset-y-1.5 left-0 rounded-sm bg-gradient-to-r from-blue/15 to-blue/55"
          style={{ width: `${Math.max(p * 100, p > 0 ? 2 : 0)}%` }}
        />
        <span className="relative flex h-full items-center justify-end pr-1.5 text-base font-semibold">{pct(p)}</span>
      </div>
    </td>
  );
}
