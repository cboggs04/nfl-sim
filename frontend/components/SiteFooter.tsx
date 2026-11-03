/** The footer on every page: where the data comes from, the usual disclaimers, and a link to the code. */
export default function SiteFooter({ updated }: { updated?: string }) {
  const date = updated ? new Date(updated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
  return (
    <footer className="mt-auto border-t border-line bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-muted sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl space-y-1.5">
          <p>
            <span className="font-semibold text-strong">NFL Season Simulator.</span> Odds come from an Elo-based model with a quarterback adjustment, simulated with Monte Carlo
            methods. Game data from{" "}
            <a href="https://github.com/nflverse" className="underline hover:text-strong" target="_blank" rel="noreferrer">
              nflverse
            </a>
            .
          </p>
          <p>For fun, not betting advice. Not affiliated with the NFL or any team; team names and logos belong to their owners.</p>
        </div>
        <div className="flex flex-col gap-1.5 md:items-end">
          {date && <span>Data updated {date}</span>}
          <a href="https://github.com/cboggs04/nfl-sim" className="font-semibold underline hover:text-strong" target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
