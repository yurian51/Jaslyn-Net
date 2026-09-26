export default function Loading() {
  return (
    <main className="app-loading" aria-label="Loading JASLYN NET" aria-busy="true">
      <div className="brand-loading-card">
        <div className="brand-loading-mark">
          <img src="/brand/jaslyn-official.svg" alt="" />
        </div>
        <div className="brand-loading-copy">
          <strong>JASLYN NET</strong>
          <span>Loading workspace…</span>
          <div className="brand-loading-track"><i /></div>
        </div>
      </div>
    </main>
  );
}
