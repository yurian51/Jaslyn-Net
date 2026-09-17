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

const publicRoutes = new Set(['/login', '/register']);
const isRouteActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(!publicRoutes.has(pathname));

  useEffect(() => {
    if (publicRoutes.has(pathname)) { setChecking(false); return; }
    if (!getAccessToken()) { router.replace('/login'); return; }
    setChecking(false);
  }, [pathname, router]);

  if (publicRoutes.has(pathname)) return <>{children}</>;
  if (checking) return <div className="console-auth-loading"><div className="console-auth-spinner" /><span>Verifying workspace session…</span></div>;
  return <>{children}</>;
}

function OperationsChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = nav.slice(4).some(([, , href]) => isRouteActive(pathname, href));

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  return (
    <div className="console-chrome-frame">
      <aside className="console-chrome-sidebar" aria-label="Jaslyn Net operations">
        <div className="console-chrome-brand"><div className="console-chrome-mark">J</div><div><strong>JASLYN NET</strong><small>Network operations platform</small></div></div>
        <div className="console-chrome-workspace"><span /> <b>TENANT WORKSPACE</b><em aria-hidden="true">⌄</em></div>
        <div className="console-chrome-section">CONTROL PLANE</div>
        <nav className="console-chrome-nav" aria-label="Control plane">
          {nav.map(([label, icon, href]) => {
            const active = isRouteActive(pathname, href);
            return <a key={href} className={active ? 'active' : ''} href={href} aria-current={active ? 'page' : undefined}><span aria-hidden="true">{icon}</span><b>{label}</b></a>;
          })}
        </nav>
        <div className="console-chrome-footer">
          <div className="console-chrome-health"><i aria-hidden="true" /> <span><b>Operations console</b><small>Authenticated API workspace</small></span></div>
          <button className="console-chrome-user" type="button" onClick={() => { clearAccessToken(); router.replace('/login'); }}><strong>J</strong><span><b>JASLYN NET</b><small>Sign out securely</small></span><em aria-hidden="true">↪</em></button>
        </div>
      </aside>
      <div className="console-chrome-content">{children}</div>
      <nav className="console-chrome-mobile" aria-label="Mobile operations navigation">
        {nav.slice(0, 4).map(([label, icon, href]) => {
          const active = isRouteActive(pathname, href);
          return <a key={href} className={active ? 'active' : ''} href={href} aria-current={active ? 'page' : undefined}><span aria-hidden="true">{icon}</span><b>{label}</b></a>;
        })}
        <button type="button" className={moreOpen || moreActive ? 'active' : ''} onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen}><span aria-hidden="true">•••</span><b>More</b></button>
        {moreOpen && <div className="console-chrome-more">{nav.slice(4).map(([label, icon, href]) => <a key={href} href={href} aria-current={isRouteActive(pathname, href) ? 'page' : undefined}><span aria-hidden="true">{icon}</span><b>{label}</b></a>)}</div>}
      </nav>
    </div>
  );
}

export default function ConsoleChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <AuthGate>{publicRoutes.has(pathname) ? children : <OperationsChrome>{children}</OperationsChrome>}</AuthGate>;
}
