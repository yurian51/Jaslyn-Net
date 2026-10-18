'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BrandLogo from '../brand-logo';
import type { Copy, Lang } from './copy';

export type NavLink = [href: string, label: string];

/**
 * Shared site header. Landing passes in-page anchors; other pages pass route links with `current`.
 * `showLang` is only true where a translated counterpart exists.
 */
export default function LandingHeader({ t, lang, links: linksProp, current, showLang = true }: { t: Copy['nav']; lang: Lang; links?: NavLink[]; current?: string; showLang?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const links: NavLink[] = linksProp ?? [['#how', t.how], ['#features', t.features], ['#hardware', t.hardware], ['#payments', t.payments], ['#pricing', t.pricing], ['#faq', t.faq]];
  const other = lang === 'en' ? '/sw' : '/';

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    items?.[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); return; }
      if (e.key !== 'Tab' || !items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="jl-header">
      <a className="jl-skip" href="#main">{t.skip}</a>
      <div className="jl-header-in">
        <Link href={lang === 'sw' ? '/sw' : '/'} className="jl-logo" aria-label="JASLYN NET"><BrandLogo alt="" className="jl-logo-img" /><span className="jl-wordmark">JASLYN NET</span></Link>
        <nav className="jl-nav" aria-label="Primary">
          {links.map(([href, label]) => <a key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</a>)}
        </nav>
        <div className="jl-header-actions">
          {showLang && <Link href={other} hrefLang={lang === 'en' ? 'sw' : 'en'} className="jl-lang" lang={lang === 'en' ? 'sw' : 'en'}>{t.switchTo}</Link>}
          <Link href="/login" className="jl-link">{t.login}</Link>
          <Link href="/register" className="jl-btn jl-btn-sm">{t.start}</Link>
          <button ref={toggleRef} type="button" className="jl-burger" aria-expanded={open} aria-controls="jl-mobile-menu" aria-label={open ? t.close : t.menu} onClick={() => setOpen((v) => !v)}>
            <span aria-hidden="true" />
          </button>
        </div>
      </div>
      {open && (
        <div id="jl-mobile-menu" ref={menuRef} className="jl-mobile" role="dialog" aria-label={t.menu}>
          {links.map(([href, label]) => <a key={href} href={href} aria-current={current === href ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</a>)}
          {showLang && <Link href={other} hrefLang={lang === 'en' ? 'sw' : 'en'}>{t.switchTo}</Link>}
          <Link href="/login">{t.login}</Link>
          <Link href="/register" className="jl-btn">{t.start}</Link>
        </div>
      )}
    </header>
  );
}
