import Link from 'next/link';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './landing.css';
import LandingHeader from './landing-header';
import PortalDemo from './portal-demo';
import { COPY, MOBILE_MONEY, VENDORS, type Lang } from './copy';
import { CONTACT, PLANS } from './site-config';

export default function LandingPage({ lang }: { lang: Lang }) {
  const t = COPY[lang];
  return (
    <div className="jl" lang={t.htmlLang}>
      <LandingHeader t={t.nav} lang={lang} />
      <main id="main">
        <section className="jl-hero" aria-labelledby="jl-h1">
          <div className="jl-wrap jl-hero-grid">
            <div className="jl-hero-copy">
              <h1 id="jl-h1">{t.hero.h1}</h1>
              <p className="jl-lead">{t.hero.lead}</p>
              <div className="jl-actions">
                <Link href="/register" className="jl-btn">{t.hero.primary}</Link>
                <Link href="/login" className="jl-btn jl-btn-ghost">{t.hero.secondary}</Link>
              </div>
              <div className="jl-rails">
                <p>{t.hero.rails}</p>
                <ul>{MOBILE_MONEY.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            </div>
            <PortalDemo t={t.demo} />
          </div>
        </section>

        <section className="jl-section jl-problem" aria-labelledby="jl-problem-h">
          <div className="jl-wrap">
            <h2 id="jl-problem-h" className="jl-h2">{t.problem.h2}</h2>
            <table className="jl-compare">
              <thead><tr><th scope="col">{t.problem.before}</th><th scope="col">{t.problem.after}</th></tr></thead>
              <tbody>{t.problem.rows.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section id="how" className="jl-section jl-how" aria-labelledby="jl-how-h">
          <div className="jl-wrap jl-split">
            <div><h2 id="jl-how-h" className="jl-h2">{t.how.h2}</h2><p className="jl-sub">{t.how.lead}</p></div>
            <ol className="jl-steps">{t.how.steps.map(([h, p]) => <li key={h}><h3>{h}</h3><p>{p}</p></li>)}</ol>
          </div>
        </section>

        <section id="features" className="jl-section jl-features" aria-labelledby="jl-features-h">
          <div className="jl-wrap">
            <h2 id="jl-features-h" className="jl-h2">{t.features.h2}</h2>
            <p className="jl-sub">{t.features.lead}</p>
            <dl className="jl-deflist">{t.features.items.map(([h, p]) => <div key={h}><dt>{h}</dt><dd>{p}</dd></div>)}</dl>
          </div>
        </section>

        <section id="hardware" className="jl-section jl-hardware" aria-labelledby="jl-hw-h">
          <div className="jl-wrap jl-split">
            <div>
              <h2 id="jl-hw-h" className="jl-h2">{t.hardware.h2}</h2>
              <p className="jl-sub">{t.hardware.lead}</p>
              <p className="jl-caveat">{t.hardware.caveat}</p>
              <Link href="/integrations" className="jl-textlink">{t.hardware.link}</Link>
            </div>
            <div className="jl-hardware-side">
              <h3 className="jl-h3">{t.hardware.vendorsLabel}</h3>
              <ul className="jl-vendors">{VENDORS.map((v) => <li key={v}>{v}</li>)}</ul>
              <div className="jl-radius"><h3 className="jl-h3">{t.hardware.radiusLabel}</h3><p>{t.hardware.radiusBody}</p></div>
            </div>
          </div>
        </section>

        <section id="payments" className="jl-section jl-payments" aria-labelledby="jl-pay-h">
          <div className="jl-wrap">
            <h2 id="jl-pay-h" className="jl-h2">{t.payments.h2}</h2>
            <p className="jl-sub">{t.payments.lead}</p>
            <ol className="jl-flow">{t.payments.flow.map(([h, p]) => <li key={h}><h3>{h}</h3><p>{p}</p></li>)}</ol>
            <div className="jl-methods"><h3 className="jl-h3">{t.payments.methodsLabel}</h3><ul>{MOBILE_MONEY.map((m) => <li key={m}>{m}</li>)}</ul></div>
            <p className="jl-note">{t.payments.note}</p>
          </div>
        </section>

        <section id="pricing" className="jl-section jl-pricing" aria-labelledby="jl-price-h">
          <div className="jl-wrap">
            <h2 id="jl-price-h" className="jl-h2">{t.pricing.h2}</h2>
            {PLANS.length === 0 ? (
              <div className="jl-price-empty">
                <p className="jl-strong">{t.pricing.empty}</p>
                <p>{t.pricing.emptyBody}</p>
                <Link href="/register" className="jl-btn">{t.pricing.cta}</Link>
              </div>
            ) : (
              <div className="jl-plans">
                {PLANS.map((p) => (
                  <article key={p.name} className={p.highlight ? 'jl-plan jl-plan-hi' : 'jl-plan'}>
                    <h3>{p.name}</h3>
                    <p className="jl-price"><b>{p.price}</b> <span>{t.pricing.per} {p.period}</span></p>
                    <p>{p.audience}</p>
                    <ul>{p.includes.map((i) => <li key={i}>{i}</li>)}</ul>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="faq" className="jl-section jl-faq" aria-labelledby="jl-faq-h">
          <div className="jl-wrap jl-split">
            <h2 id="jl-faq-h" className="jl-h2">{t.faq.h2}</h2>
            <div className="jl-faq-list">
              {t.faq.items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
              <Link href="/faq" className="jl-textlink">{t.faq.more}</Link>
            </div>
          </div>
        </section>

        <section className="jl-cta" aria-labelledby="jl-cta-h">
          <div className="jl-wrap jl-cta-in">
            <div><h2 id="jl-cta-h">{t.cta.h2}</h2><p>{t.cta.body}</p></div>
            <div className="jl-actions">
              <Link href="/register" className="jl-btn jl-btn-light">{t.cta.primary}</Link>
              <Link href="/faq" className="jl-btn jl-btn-outline">{t.cta.secondary}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="jl-footer">
        <div className="jl-wrap jl-footer-in">
          <p><strong>JASLYN NET</strong><br />{t.footer.tagline}</p>
          <nav aria-label="Footer">{t.footer.links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
          {CONTACT && (CONTACT.email || CONTACT.whatsapp) ? (
            <p className="jl-contact">{CONTACT.email && <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>}{CONTACT.whatsapp && <a href={`https://wa.me/${CONTACT.whatsapp.replace(/\D/g, '')}`}>WhatsApp</a>}</p>
          ) : null}
          <small>{t.footer.legal}</small>
        </div>
      </footer>
    </div>
  );
}
