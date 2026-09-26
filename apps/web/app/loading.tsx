import BrandLogo from './brand-logo';

export default function Loading() {
  return (
    <main className="app-loading" aria-label="Loading JASLYN NET" aria-busy="true">
      <section className="brand-loading-stage" aria-label="Loading workspace">
        <div className="brand-loading-identity">
          <div className="brand-loading-mark">
            <BrandLogo alt="" />
          </div>
          <div className="brand-loading-copy">
            <strong>JASLYN NET</strong>
            <span>Preparing your workspace</span>
          </div>
        </div>

        <div className="brand-loading-progress" aria-hidden="true">
          <i />
        </div>

        <div className="brand-loading-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <div><b /><b /><b /></div>
        </div>
      </section>
    </main>
  );
}
