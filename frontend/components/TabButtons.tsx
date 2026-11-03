"use client";

/**
 * The view switcher used inside pages (Overview / Season simulator, Standings / Bracket). It's a small filled pill group, so it
 * doesn't look like the underlined links in the top bar.
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
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-head p-1 ring-1 ring-line">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          id={idFor(t.key)}
          aria-selected={active === t.key}
          aria-controls={panelIdFor(t.key)}
          onClick={() => onSelect(t.key)}
          className={`font-display shrink-0 rounded-md px-4 py-1 text-xl whitespace-nowrap transition-colors ${
            active === t.key ? "bg-accent text-on-accent shadow-sm" : "text-muted hover:bg-hover hover:text-strong"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
