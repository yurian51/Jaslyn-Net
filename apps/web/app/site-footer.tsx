import Link from 'next/link';

const groups = [
  { title: 'Bidhaa', links: [['/platform', 'Muhtasari wa jukwaa'], ['/packages', 'Vifurushi vya Wi-Fi'], ['/vouchers', 'Hotspot na vocha'], ['/payments', 'Malipo'], ['/network', 'Network operations']] },
  { title: 'Rasilimali', links: [['/faq', 'Maswali ya kawaida'], ['/integrations', 'Integrations'], ['/architecture', 'Usanifu wa mfumo'], ['/operations', 'Uendeshaji']] },
  { title: 'Developers', links: [['https://github.com/yurian51/Jaslyn-Net', 'GitHub'], ['/integrations', 'API na integrations'], ['/architecture', 'Technical overview']] },
  { title: 'Kampuni', links: [['/legal', 'Sheria na faragha'], ['/register', 'Anza kutumia'], ['/login', 'Ingia']] },
] as const;

export default function SiteFooter() {
  return (
    <footer className="jn-footer">
      <div className="jn-footer-main">
        <section className="jn-footer-about" aria-label="Kuhusu Jaslyn Net">
          <Link href="/" className="jn-footer-brand"><span className="jn-footer-mark" aria-hidden="true">⌁</span><span>JASLYN <b>NET</b><small>Connect. Control. Grow.</small></span></Link>
          <p>Jaslyn Net ni jukwaa la kusimamia Wi-Fi, wateja, malipo na shughuli za ISP katika sehemu moja.</p>
          <a className="jn-footer-repository" href="https://github.com/yurian51/Jaslyn-Net" target="_blank" rel="noopener noreferrer">
            <span className="jn-footer-repository-mark" aria-hidden="true">GH</span>
            <span><b>Chanzo na maendeleo ya mradi</b><small>Angalia Jaslyn Net kwenye GitHub</small></span>
            <span className="jn-footer-repository-arrow" aria-hidden="true">↗</span>
          </a>
        </section>
        {groups.map((group) => (
          <nav className="jn-footer-group" key={group.title} aria-label={group.title}>
            <h2>{group.title}</h2>
            {group.links.map(([href, label]) => href.startsWith('http') ? <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}<span aria-hidden="true">↗</span></a> : <Link key={label} href={href}>{label}<span aria-hidden="true">↗</span></Link>)}
          </nav>
        ))}
        <aside className="jn-footer-join">
          <span className="jn-footer-eyebrow">CONNECT. CONTROL. GROW.</span>
          <h2>Mtandao wako, usimamizi mmoja.</h2>
          <p>Unganisha usimamizi wa wateja, billing na network operations kwa mtiririko unaoeleweka.</p>
          <Link href="/register" className="jn-footer-cta">Anza sasa <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
      <div className="jn-footer-bottom">
        <span>© {new Date().getFullYear()} YURIAN TECH LTD. Haki zote zimehifadhiwa.</span>
        <nav aria-label="Viungo vya kisheria"><Link href="/legal">Faragha na sheria</Link><Link href="/faq">Msaada</Link></nav>
        <span className="jn-footer-signoff">Imeundwa na YURIAN TECH LTD</span>
      </div>
    </footer>
  );
}
