/** The big title at the top of every page, so they all use the same size. The second word is usually the accent-colored one. */
export default function PageTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h1 className={`font-display text-4xl text-strong sm:text-6xl land:text-3xl ${className}`}>{children}</h1>;
}
