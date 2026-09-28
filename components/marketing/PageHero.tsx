interface PageHeroProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
}

// Interior-page header band. Top padding clears the fixed SiteNav.
export function PageHero({ eyebrow, title, subtitle }: PageHeroProps) {
  return (
    <section className="border-b border-homeward-border bg-gradient-to-b from-homeward-mint/50 to-white">
      <div className="mx-auto max-w-4xl px-4 pb-14 pt-28 text-center sm:px-6 sm:pt-32">
        <span className="animate-fade-up eyebrow inline-block">{eyebrow}</span>
        <h1 className="mt-3 animate-fade-up text-4xl font-semibold text-homeward-ink [animation-delay:80ms] sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-4 max-w-2xl animate-fade-up text-base leading-relaxed text-homeward-muted [animation-delay:160ms]">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
