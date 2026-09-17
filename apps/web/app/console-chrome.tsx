'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clearAccessToken, getAccessToken } from '../lib/auth';

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

function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(pathname !== '/login');

  useEffect(() => {
    if (pathname === '/login') {
      setChecking(false);
      return;
    }
    if (!getAccessToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setChecking(false);
  }, [pathname, router]);

  if (pathname === '/login') return <>{children}</>;
  if (checking) return <div className="console-auth-loading"><div className="console-auth-spinner" /><span>Verifying workspace session…</span></div>;
  return <>{children}</>;
}

function OperationsChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

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
          <button className="console-chrome-user" type="button" onClick={() => { clearAccessToken(); router.replace('/login'); }}>
            <strong>J</strong><span><b>JASLYN NET</b><small>Sign out securely</small></span><em>↪</em>
          </button>
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
        {moreOpen && <div className="console-chrome-more">{nav.slice(4).map(([label, icon, href]) => <a key={href} href={href}><span>{icon}</span><b>{label}</b></a>)}</div>}
      </nav>
    </div>
  );
}

export default function ConsoleChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <AuthGate>{pathname === '/login' ? children : chromeRoutes.has(pathname) ? <OperationsChrome>{children}</OperationsChrome> : children}</AuthGate>;
}
