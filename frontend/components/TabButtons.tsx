"use client";

/**
 * The view switcher used inside pages (Overview / Season simulator, Standings / Bracket). It's a small filled pill group, so it
 * doesn't look like the underlined links in the top bar. On phones the tabs share the full width equally, so they all fit.
 */
export default function TabButtons({
  tabs,
  active,
  onSelect,
  label,
  idFor,
  panelIdFor,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
  label: string;
  idFor: (key: string) => string;
  panelIdFor: (key: string) => string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex w-full max-w-full gap-1 overflow-x-auto rounded-lg bg-head p-1 ring-1 ring-line sm:inline-flex sm:w-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          id={idFor(t.key)}
          aria-selected={active === t.key}
          aria-controls={panelIdFor(t.key)}
          onClick={() => onSelect(t.key)}
          className={`font-display min-w-0 flex-1 shrink-0 rounded-md px-1.5 py-1 text-base whitespace-nowrap min-[360px]:px-2 min-[360px]:text-lg transition-colors sm:flex-none sm:px-4 sm:text-xl ${
            active === t.key ? "bg-accent text-on-accent shadow-sm" : "text-muted hover:bg-hover hover:text-strong"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
