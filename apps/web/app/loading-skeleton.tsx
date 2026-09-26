import BrandLogo from './brand-logo';

export function ConsoleSkeleton() {
  return (
    <main className="console-skeleton-page" aria-label="Loading JASLYN NET workspace" aria-busy="true">
      <aside className="console-skeleton-sidebar">
        <div className="console-skeleton-brand">
          <BrandLogo alt="" />
          <span className="skeleton skeleton-brand-title" />
        </div>
        <span className="skeleton skeleton-workspace" />
        <div className="skeleton-group">
          <span className="skeleton skeleton-section-label" />
          {Array.from({ length: 8 }).map((_, index) => (
            <span className="skeleton skeleton-nav-row" key={index} />
          ))}
        </div>
        <div className="skeleton skeleton-sidebar-status" />
      </aside>

      <section className="console-skeleton-main">
        <header className="console-skeleton-topbar">
          <div>
            <span className="skeleton skeleton-eyebrow" />
            <span className="skeleton skeleton-heading" />
            <span className="skeleton skeleton-context" />
          </div>
          <div className="console-skeleton-actions">
            <span className="skeleton skeleton-button" />
            <span className="skeleton skeleton-button skeleton-button-wide" />
          </div>
        </header>

        <div className="console-skeleton-kpis">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className="console-skeleton-card" key={index}>
              <span className="skeleton skeleton-kpi-label" />
              <span className="skeleton skeleton-kpi-value" />
              <span className="skeleton skeleton-kpi-foot" />
            </article>
          ))}
        </div>

        <div className="console-skeleton-grid">
          <article className="console-skeleton-card console-skeleton-large">
            <span className="skeleton skeleton-panel-title" />
            <span className="skeleton skeleton-panel-copy" />
            <div className="skeleton skeleton-chart" />
          </article>
          <article className="console-skeleton-card console-skeleton-side">
            <span className="skeleton skeleton-panel-title" />
            <span className="skeleton skeleton-panel-copy short" />
            {Array.from({ length: 4 }).map((_, index) => (
              <span className="skeleton skeleton-list-row" key={index} />
            ))}
          </article>
        </div>
      </section>
    </main>
  );
}
