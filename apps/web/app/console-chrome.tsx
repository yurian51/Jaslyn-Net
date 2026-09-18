'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAccessToken, getAccessToken } from '../lib/auth';

type IconName = 'overview' | 'customers' | 'sessions' | 'network' | 'loadBalancing' | 'isp' | 'purchases' | 'packages' | 'incidents' | 'audit';

const nav: ReadonlyArray<[string, IconName, string]> = [
  ['Overview', 'overview', '/dashboard'],
  ['Customers', 'customers', '/customers'],
  ['Sessions', 'sessions', '/sessions'],
  ['Network', 'network', '/network'],
  ['WAN & Load Balancing', 'loadBalancing', '/load-balancing'],
  ['ISP Operations', 'isp', '/isp'],
  ['Purchases', 'purchases', '/purchases'],
  ['Plans & Products', 'packages', '/packages'],
  ['Incident Center', 'incidents', '/incidents'],
  ['Security & Audit', 'audit', '/audit'],
];

const publicRoutes = new Set(['/login', '/register']);
const isRouteActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    customers: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c.7-3.2 3.1-5 7.5-5s6.8 1.8 7.5 5" /></>,
    sessions: <><path d="M7 7h10" /><path d="M7 12h10" /><path d="M7 17h6" /><circle cx="4" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="17" r="1" fill="currentColor" stroke="none" /></>,
    network: <><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="M8 9h8M8 12h5" /></>,
    loadBalancing: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 7.5 16 16.5M18 8v4M18 12l-3-3M18 12l3-3M6 16v-4M6 12l-3 3M6 12l3 3" /></>,
    isp: <><path d="M4 18h16" /><path d="M7 18V9l5-4 5 4v9" /><path d="M10 18v-5h4v5" /><path d="M9 9h.01M15 9h.01" /></>,
    purchases: <><path d="M5 7h14l-1 13H6L5 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /><path d="M9 11h.01M15 11h.01" /></>,
    packages: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M4.5 7.8 12 12l7.5-4.2M12 12v9" /></>,
    incidents: <><path d="M12 3 21 20H3L12 3Z" /><path d="M12 9v5" /><path d="M12 17h.01" /></>,
    audit: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M15 3v4h4M9 12h6M9 16h6M9 8h2" /></>,
  };

  return <svg className="console-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

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
  const moreActive = nav.slice(5).some(([, , href]) => isRouteActive(pathname, href));

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  return (
    <div className="console-chrome-frame">
      <aside className="console-chrome-sidebar" aria-label="Jaslyn Net operations">
        <div className="console-chrome-brand">
          <div className="console-chrome-mark"><img src="/brand/jaslyn-net-icon.svg" alt="" /></div>
          <div><strong>JASLYN NET</strong><small>Connectivity operations</small></div>
        </div>
        <div className="console-chrome-workspace"><span /> <b>TENANT WORKSPACE</b><em aria-hidden="true">⌄</em></div>
        <div className="console-chrome-section">CONTROL PLANE</div>
        <nav className="console-chrome-nav" aria-label="Control plane">
          {nav.map(([label, icon, href]) => {
            const active = isRouteActive(pathname, href);
            return <Link key={href} className={active ? 'active' : ''} href={href} aria-current={active ? 'page' : undefined}><span><NavIcon name={icon} /></span><b>{label}</b></Link>;
          })}
        </nav>
        <div className="console-chrome-footer">
          <div className="console-chrome-health"><i aria-hidden="true" /> <span><b>Workspace session</b><small>Authenticated operator access</small></span></div>
          <button className="console-chrome-user" type="button" onClick={() => { clearAccessToken(); router.replace('/login'); }}><strong><img src="/brand/jaslyn-net-icon.svg" alt="" /></strong><span><b>JASLYN NET</b><small>Sign out securely</small></span><em aria-hidden="true">↪</em></button>
        </div>
      </aside>
      <div className="console-chrome-content">{children}</div>
      <nav className="console-chrome-mobile" aria-label="Mobile operations navigation">
        {nav.slice(0, 4).map(([label, icon, href]) => {
          const active = isRouteActive(pathname, href);
          return <Link key={href} className={active ? 'active' : ''} href={href} aria-current={active ? 'page' : undefined}><span><NavIcon name={icon} /></span><b>{label}</b></Link>;
        })}
        <button type="button" className={moreOpen || moreActive ? 'active' : ''} onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen}><span>•••</span><b>More</b></button>
        {moreOpen && <div className="console-chrome-more">{nav.slice(4).map(([label, icon, href]) => <Link key={href} href={href} aria-current={isRouteActive(pathname, href) ? 'page' : undefined}><span><NavIcon name={icon} /></span><b>{label}</b></Link>)}</div>}
      </nav>
    </div>
  );
}

export default function ConsoleChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <AuthGate>{publicRoutes.has(pathname) ? children : <OperationsChrome>{children}</OperationsChrome>}</AuthGate>;
}
