import Link from "next/link";

const ICON_PROPS = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const FEATURES = [
  {
    href: "/bracket",
    title: "Playoff simulator",
    blurb: "Simulate the rest of the season, then play the bracket round by round.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 5h5v4H3zM3 15h5v4H3zM16 10h5v4h-5zM8 7h3v10H8M11 12h5" />
      </svg>
    ),
  },
  {
    href: "/leaders",
    title: "Stat leaders",
    blurb: "Projected league leaders and the odds for MVP and the other awards.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </svg>
    ),
  },
  {
    href: "/play",
    title: "Play now",
    blurb: "A pixel-art football game: pick plays, throw, run and score.",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="2" y="7" width="20" height="11" rx="5" />
        <path d="M7 10.5v4M5 12.5h4M16 11h.01M18.5 14h.01" />
      </svg>
    ),
  },
  {
    href: "/whatif",
    title: "What-if sandbox",
    blurb: "Boost a team or force a result and watch every team's odds move.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </svg>
    ),
  },
  {
    href: "#league-board",
    title: "Team pages",
    blurb: "Pick any team for its schedule, odds, players and game replays.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
];

/** A row of cards that says what the site can do and links to each part. */
export default function FeatureCards() {
  return (
    <nav aria-label="What you can do here" className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
      {FEATURES.map((f) => (
        <Link
          key={f.title}
          href={f.href}
          className="group panel-flat flex items-center gap-3 p-3 sm:items-start transition-colors last:col-span-2 lg:last:col-span-1 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="flex h-9 w-9 shrink-0 sm:mt-0.5 items-center justify-center rounded-md bg-accent/12 text-accent-ink ring-1 ring-accent/25">{f.icon}</span>
          <span className="min-w-0">
            <span className="font-display block text-xl leading-tight text-strong group-hover:text-accent-ink">{f.title}</span>
            <span className="mt-0.5 hidden text-xs leading-snug text-muted sm:block">{f.blurb}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
