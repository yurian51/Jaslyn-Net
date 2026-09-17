'use client';

import { ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';

const nav = [
  ['Overview', '⌂', '/dashboard'],
  ['Customers', '◉', '/customers'],
  ['Sessions', '◌', '/sessions'],
  ['Network', '⌁', '/network'],
  ['Purchases', '₮', '/purchases'],
  ['Plans & Products', '▣', '/packages'],
  ['Security & Audit', '◈', '/audit'],
] as const;

const chromeRoutes = new Set(['/customers', '/packages', '/purchases']);

export default function ConsoleChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!chromeRoutes.has(pathname)) return <>{children}</>;

  return (
    <div className="console-chrome-frame">
      <aside className="console-chrome-sidebar" aria-label="Jaslyn Net operations">
        <div className="console-chrome-brand">
          <div className="console-chrome-mark">J</div>
          <div><strong>JASLYN NET</strong><small>Network operations platform</small></div>
        </div>
        <div className="console-chrome-workspace"><span /> <b>GLOBAL WORKSPACE</b><em>⌄</em></div>
        <div className="console-chrome-section">CONTROL PLANE</div>
        <nav className="console-chrome-nav">
          {nav.map(([label, icon, href]) => (
            <a key={href} className={pathname === href ? 'active' : ''} href={href} aria-current={pathname === href ? 'page' : undefined}>
              <span>{icon}</span><b>{label}</b>
            </a>
          ))}
        </nav>
        <div className="console-chrome-footer">
          <div className="console-chrome-health"><i /> <span><b>Control plane</b><small>API-backed operations</small></span></div>
          <div className="console-chrome-user"><strong>J</strong><span><b>JASLYN NET</b><small>Tenant workspace</small></span></div>
        </div>
      </aside>

      <div className="console-chrome-content">{children}</div>

      <nav className="console-chrome-mobile" aria-label="Mobile operations navigation">
        {nav.slice(0, 4).map(([label, icon, href]) => (
          <a key={href} className={pathname === href ? 'active' : ''} href={href} aria-current={pathname === href ? 'page' : undefined}>
            <span>{icon}</span><b>{label}</b>
          </a>
        ))}
        <button type="button" className={moreOpen ? 'active' : ''} onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen}>
          <span>•••</span><b>More</b>
        </button>
        {moreOpen && (
          <div className="console-chrome-more">
            {nav.slice(4).map(([label, icon, href]) => (
              <a key={href} href={href}><span>{icon}</span><b>{label}</b></a>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
