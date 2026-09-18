'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAccessToken, getAccessToken } from '../lib/auth';
import { apiFetch } from '../lib/api';

type IconName = 'overview' | 'customers' | 'sessions' | 'accessNetwork' | 'fiber' | 'network' | 'ipam' | 'loadBalancing' | 'isp' | 'purchases' | 'payments' | 'vouchers' | 'packages' | 'networkCommands' | 'notifications' | 'radius' | 'incidents' | 'audit' | 'settings';

const nav: ReadonlyArray<[string, IconName, string]> = [
  ['Overview', 'overview', '/dashboard'],
  ['Customers', 'customers', '/customers'],
  ['Sessions', 'sessions', '/sessions'],
  ['Access Network', 'accessNetwork', '/access-network'],
  ['Fiber', 'fiber', '/fiber'],
  ['Network', 'network', '/network'],
  ['IPAM', 'ipam', '/ipam'],
  ['WAN & Load Balancing', 'loadBalancing', '/load-balancing'],
  ['ISP Operations', 'isp', '/isp'],
  ['Purchases', 'purchases', '/purchases'],
  ['Payments', 'payments', '/payments'],
  ['Vouchers', 'vouchers', '/vouchers'],
  ['Plans & Products', 'packages', '/packages'],
  ['Network Commands', 'networkCommands', '/network-commands'],
  ['RADIUS / AAA', 'radius', '/radius'],
  ['Notifications', 'notifications', '/notifications'],
  ['Incident Center', 'incidents', '/incidents'],
  ['Security & Audit', 'audit', '/audit'],
  ['Settings', 'settings', '/settings'],
];

const mobileMoreGroups: ReadonlyArray<[string, string[]]> = [
  ['Network', ['/access-network', '/fiber', '/ipam', '/load-balancing', '/network-commands', '/radius']],
  ['Commercial', ['/purchases', '/payments', '/vouchers', '/packages']],
  ['Operations', ['/isp', '/notifications', '/incidents', '/audit']],
];

const publicRoutes = new Set(['/', '/login', '/register']);
const isPublicRoute = (pathname: string) => publicRoutes.has(pathname) || pathname === '/legal' || pathname.startsWith('/legal/');
const isRouteActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    customers: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c.7-3.2 3.1-5 7.5-5s6.8 1.8 7.5 5" /></>,
    sessions: <><path d="M7 7h10" /><path d="M7 12h10" /><path d="M7 17h6" /><circle cx="4" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="17" r="1" fill="currentColor" stroke="none" /></>,
    accessNetwork: <><path d="M3 10a13 13 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9 16a5 5 0 0 1 6 0" /><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" /></>,
    fiber: <><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="7" cy="7" r="1"/><circle cx="17" cy="17" r="1"/><path d="M10 7v10" /></>,
    network: <><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="M8 9h8M8 12h5" /></>,
    ipam: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h8M6 8v8M18 8v8M8 18h8" /></>,
    loadBalancing: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 7.5 16 16.5M18 8v4M18 12l-3-3M18 12l3-3M6 16v-4M6 12l-3 3M6 12l3 3" /></>,
    isp: <><path d="M4 18h16" /><path d="M7 18V9l5-4 5 4v9" /><path d="M10 18v-5h4v5" /><path d="M9 9h.01M15 9h.01" /></>,
    purchases: <><path d="M5 7h14l-1 13H6L5 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /><path d="M9 11h.01M15 11h.01" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    vouchers: <><path d="M4 7h16v10H4z" /><path d="M8 7v10M16 7v10" /><path d="M10 10h4M10 14h2" /></>,
    packages: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M4.5 7.8 12 12l7.5-4.2M12 12v9" /></>,
    networkCommands: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/></>,
    notifications: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    radius: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
    incidents: <><path d="M12 3 21 20H3L12 3Z" /><path d="M12 9v5" /><path d="M12 17h.01" /></>,
    audit: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M15 3v4h4M9 12h6M9 16h6M9 8h2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05-1.41 1.41-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V20h-2v-.32a1.8 1.8 0 0 0-1.09-1.65 1.8 1.8 0 0 0-1.98.36l-.05.05-1.41-1.41.05-.05A1.8 1.8 0 0 0 9.2 15a1.8 1.8 0 0 0-1.65-1.09H7v-2h.32A1.8 1.8 0 0 0 8.97 10a1.8 1.8 0 0 0-.36-1.98l-.05-.05 1.41-1.41.05.05A1.8 1.8 0 0 0 12 6.25V6h2v.32A1.8 1.8 0 0 0 15.09 7.97a1.8 1.8 0 0 0 1.98-.36l.05-.05 1.41 1.41-.05.05A1.8 1.8 0 0 0 18.83 11H19v2h-.32A1.8 1.8 0 0 0 17.03 15Z" /></>,
  };

  return <svg className="console-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(!isPublicRoute(pathname));

  useEffect(() => {
    if (isPublicRoute(pathname)) { setChecking(false); return; }
    if (!getAccessToken()) { router.replace('/login'); return; }
    setChecking(false);
  }, [pathname, router]);

  if (isPublicRoute(pathname)) return <>{children}</>;
  if (checking) return <div className="console-auth-loading"><div className="console-auth-spinner" /><span>Verifying workspace session…</span></div>;
  return <>{children}</>;
}

function OperationsChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [legalUpdate, setLegalUpdate] = useState(false);
  // Keep only the highest-frequency operator destinations in the Android bottom bar.
  // Everything else remains reachable through More, preserving a clean hybrid-app shell.
  const mobilePrimaryHrefs = ['/dashboard', '/customers', '/sessions', '/network'];
  const moreActive = nav.some(([, , href]) => !mobilePrimaryHrefs.includes(href) && href !== '/settings' && isRouteActive(pathname, href));

  useEffect(() => { setMoreOpen(false); setHeaderMenuOpen(false); }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();
    if (!token) return;
    apiFetch<{ documents: Array<{ current: boolean }> }>('/auth/legal-acceptance', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((result) => {
      if (!cancelled) setLegalUpdate(result.documents.some((document) => !document.current));
    }).catch(() => {
      if (!cancelled) setLegalUpdate(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="console-chrome-frame">
      {legalUpdate && <div className="console-legal-alert" role="status"><span><strong>Legal documents updated</strong><small>Review the current Terms and Privacy Notice before continuing.</small></span><Link href="/legal">Review legal center</Link></div>}
      <aside className="console-chrome-sidebar" aria-label="Jaslyn Net operations">
        <div className="console-chrome-brand">
          <div className="console-chrome-mark"><img src="/brand/jaslyn-net-mark.svg" alt="" /></div>
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
          <div className="console-chrome-health"><i aria-hidden="true" /> <span><b>Workspace session</b><small>Authenticated operator access</small></span></div><Link className="console-chrome-legal" href="/legal/privacy">Privacy & legal</Link>
          <button className="console-chrome-user" type="button" onClick={() => { clearAccessToken(); router.replace('/login'); }}><strong><img src="/brand/jaslyn-net-mark.svg" alt="" /></strong><span><b>JASLYN NET</b><small>Sign out securely</small></span><em aria-hidden="true">↪</em></button>
        </div>
      </aside>
      <header className="console-mobile-header">
        <Link href="/dashboard" className="console-mobile-brand" aria-label="JASLYN NET overview">
          <span><img src="/brand/jaslyn-net-mark.svg" alt="" /></span>
          <strong>JASLYN NET</strong>
        </Link>
        <div className="console-mobile-header-actions">
          <Link href="/notifications" aria-label="Notifications"><NavIcon name="notifications" /></Link>
          <button type="button" aria-label="More workspace actions" aria-expanded={headerMenuOpen} onClick={() => setHeaderMenuOpen(v => !v)}>
            <span aria-hidden="true">⋮</span>
          </button>
        </div>
        {headerMenuOpen && (
          <div className="console-mobile-header-menu" role="menu" aria-label="Workspace shortcuts">
            <Link href="/purchases" role="menuitem"><NavIcon name="purchases" /><span>Purchase & Access</span></Link>
            <Link href="/network" role="menuitem"><NavIcon name="network" /><span>Network</span></Link>
            <Link href="/notifications" role="menuitem"><NavIcon name="notifications" /><span>Notifications</span></Link>
            <Link href="/settings" role="menuitem"><NavIcon name="settings" /><span>Settings</span></Link>
          </div>
        )}
      </header>
      <div className="console-chrome-content">{children}</div>
      <nav className="console-chrome-mobile" aria-label="Mobile operations navigation">
        {nav.filter(([, , href]) => ['/dashboard', '/customers', '/sessions', '/network'].includes(href)).map(([label, icon, href]) => {
          const active = isRouteActive(pathname, href);
          return <Link key={href} className={active ? 'active' : ''} href={href} aria-current={active ? 'page' : undefined}><span><NavIcon name={icon} /></span><b>{label}</b></Link>;
        })}
        <button type="button" className={moreOpen || moreActive ? 'active' : ''} onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen}><span>•••</span><b>More</b><i className="console-mobile-dot" aria-hidden="true" /></button>
        <Link key="mobile-quick-scan" className="console-mobile-scan" href="/purchases" aria-label="Quick purchase and access" title="Quick purchase and access"><span aria-hidden="true">+</span></Link>
        {moreOpen && <div className="console-chrome-more"><div className="console-chrome-more-title">JASLYN NET · OPERATIONS</div>{mobileMoreGroups.map(([group, hrefs]) => <div className="console-chrome-more-group" key={group}><div className="console-chrome-more-group-title">{group}</div>{hrefs.map(href => { const item = nav.find(([, , itemHref]) => itemHref === href); if (!item) return null; const [label, icon] = item; const active = isRouteActive(pathname, href); return <Link key={href} className={active ? 'active' : ''} href={href} aria-current={active ? 'page' : undefined}><span><NavIcon name={icon} /></span><b>{label}</b></Link>; })}</div>)}<div className="console-chrome-more-group"><div className="console-chrome-more-group-title">Workspace</div><Link href="/settings" className={isRouteActive(pathname, '/settings') ? 'active' : ''} aria-current={isRouteActive(pathname, '/settings') ? 'page' : undefined}><span><NavIcon name="settings" /></span><b>Settings</b></Link></div></div>}
      </nav>
    </div>
  );
}

export default function ConsoleChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <AuthGate>{isPublicRoute(pathname) ? children : <OperationsChrome>{children}</OperationsChrome>}</AuthGate>;
}
