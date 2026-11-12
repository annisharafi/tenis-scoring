/** Lowercase display title with a light 50% subtitle, 40px from the top. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex flex-col gap-1 pt-10">
      <h1 className="font-display text-title">{title}</h1>
      {subtitle && <p className="text-small font-light lowercase opacity-50">{subtitle}</p>}
    </header>
  )
}
