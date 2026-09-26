'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BrandLogo from './brand-logo';

const sectionLinks: ReadonlyArray<[string, string]> = [
  ['#platform', 'Platform'],
  ['#architecture', 'Architecture'],
  ['#operations', 'Operations'],
  ['#integrations', 'Integrations'],
  ['#modules', 'Product'],
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <nav className="landing-nav">
      <Link href="/" className="landing-logo" aria-label="JASLYN NET home" onClick={() => setOpen(false)}>
        <span><BrandLogo alt="" /></span>
        <b>JASLYN NET</b>
      </Link>
      <div className="landing-links">
        {sectionLinks.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
      </div>
      <div className="landing-actions">
        <Link href="/login" className="landing-signin">Sign in</Link>
        <Link href="/register" className="landing-cta">Get started ↗</Link>
        <button
          type="button"
          className="landing-menu-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="landing-mobile-menu" id="landing-mobile-menu" role="dialog" aria-modal="true" aria-label="Site menu">
          <div className="landing-mobile-menu-links">
            {sectionLinks.map(([href, label]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
          </div>
          <div className="landing-mobile-menu-actions">
            <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
            <Link href="/register" onClick={() => setOpen(false)}>Get started ↗</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
