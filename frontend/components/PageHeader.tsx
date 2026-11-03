import PageTitle from "@/components/PageTitle";

/** The top of every page ("tight" is only for Play now's team select, which has to fit on one screen): the title, a one-line subtitle, and an optional action on the right (like Play now's "?"). The gap below it is always the same. */
export default function PageHeader({ title, subtitle, action, tight = false }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; tight?: boolean }) {
  return (
    <header className={tight ? "mb-3" : "mb-6 land:mb-3"}>
      <div className="flex items-start justify-between gap-4">
        <PageTitle>{title}</PageTitle>
        {action && <div className="mt-1 shrink-0">{action}</div>}
      </div>
      {subtitle && <p className="mt-3 max-w-2xl text-sm text-muted land:hidden">{subtitle}</p>}
    </header>
  );
}
