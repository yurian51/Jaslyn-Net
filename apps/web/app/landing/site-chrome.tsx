import Link from 'next/link';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './landing.css';
import './pages.css';
import LandingHeader, { type NavLink } from './landing-header';
import { COPY, type Lang } from './copy';
import { CONTACT } from './site-config';

/** Routes of the marketing pages, in the order the landing page links them. */
export const SITE_LINKS: NavLink[] = [['/platform', 'Platform'], ['/architecture', 'How it works'], ['/operations', 'Operations'], ['/integrations', 'Integrations'], ['/product', 'Features'], ['/faq', 'FAQ']];

export function SiteHeader({ current, lang = 'en' }: { current?: string; lang?: Lang }) {
  return <LandingHeader t={COPY[lang].nav} lang={lang} links={SITE_LINKS} current={current} showLang={false} />;
}

export function SiteFooter({ lang = 'en', sampleNote = false }: { lang?: Lang; sampleNote?: boolean }) {
  const t = COPY[lang];
  return (
    <footer className="jl-footer">
      <div className="jl-wrap jl-footer-in">
        <p><strong>JASLYN NET</strong><br />{t.footer.tagline}</p>
        <nav aria-label="Footer">{t.footer.links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        {CONTACT && (CONTACT.email || CONTACT.whatsapp) ? (
          <p className="jl-contact">{CONTACT.email && <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>}{CONTACT.whatsapp && <a href={`https://wa.me/${CONTACT.whatsapp.replace(/\D/g, '')}`}>WhatsApp</a>}</p>
        ) : null}
        {sampleNote && <small>{t.footer.legal}</small>}
      </div>
    </footer>
  );
}

/** Wraps a page in the shared design system scope, header and footer. */
export default function SiteShell({ children, current, mainClass = '' }: { children: React.ReactNode; current?: string; mainClass?: string }) {
  return (
    <div className="jl" lang="en">
      <SiteHeader current={current} />
      <main id="main" className={mainClass}>{children}</main>
      <SiteFooter />
    </div>
  );
}
