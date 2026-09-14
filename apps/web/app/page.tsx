'use client';

import Link from 'next/link';

const pillars = [
  { number: '01', title: 'Sell internet', text: 'Create packages, publish a branded captive portal, issue vouchers and turn every connection into a managed service.' },
  { number: '02', title: 'Run the network', text: 'Manage locations, routers, hotspots, sessions and network access from one operational control plane.' },
  { number: '03', title: 'Get paid', text: 'Connect billing and payment workflows, reconcile transactions and keep customer access tied to verified service.' },
  { number: '04', title: 'Scale the business', text: 'Operate multiple locations, customers, agents and services without rebuilding your workflow for every site.' },
];

const modules = [
  ['Billing', 'Packages, subscriptions, invoices and revenue workflows.'],
  ['Customers', 'Accounts, devices, service history and lifecycle management.'],
  ['Hotspot', 'Captive portals, access policies and customer self-service.'],
  ['Vouchers', 'Create, distribute, track and control prepaid access.'],
  ['Sessions', 'Live connections, usage, status and session history.'],
  ['Network', 'Routers, sites, connectivity and operational visibility.'],
  ['Payments', 'Transactions, verification, reconciliation and records.'],
  ['Agents', 'Resellers, commissions, balances and sales operations.'],
];

const integrations = ['MikroTik RouterOS', 'FreeRADIUS', 'Mobile Money', 'HotSpot', 'PPPoE', 'REST API'];

export default function Home() {
  return (
    <main className="landing">
      <nav className="nav" aria-label="Main navigation">
        <Link href="/" className="logo" aria-label="Jaslyn Net home"><span>J</span><b>JASLYN NET</b></Link>
        <div className="links">
          <a href="#platform">Platform</a>
          <a href="#workflow">How it works</a>
          <a href="#network">Network</a>
          <a href="#pricing">Plans</a>
        </div>
        <div className="nav-actions">
          <Link href="/login" className="login">Sign in</Link>
          <Link href="/login" className="nav-cta">Open console <span>↗</span></Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><i /> WIFI • BILLING • NETWORK OPERATIONS</div>
          <h1>Run your WiFi business<br /><em>from one control plane.</em></h1>
          <p>JASLYN NET brings customers, packages, vouchers, payments, sessions, routers and locations together so you can sell internet and operate the network without stitching together separate systems.</p>
          <div className="hero-actions">
            <Link href="/login" className="primary">Enter JASLYN NET <span>→</span></Link>
            <a href="#platform" className="secondary">Explore the platform</a>
          </div>
          <div className="trust-row">
            <span>Built for WiFi operators</span><i />
            <span>Hotspot & ISP workflows</span><i />
            <span>Multi-location ready</span>
          </div>
        </div>
        <div className="hero-product" aria-label="Illustrative Jaslyn Net product preview">
          <div className="window-bar"><span className="dots"><i /><i /><i /></span><b>JASLYN NET / OPERATIONS</b><span className="secure">SECURE CONTROL PLANE</span></div>
          <div className="product-shell">
            <aside>
              <div className="side-brand"><span>J</span><div><b>JASLYN NET</b><small>OPERATIONS</small></div></div>
              <small className="side-label">OPERATE</small>
              <span className="side-active">⌂ Overview</span><span>◉ Customers</span><span>▣ Packages</span><span>◌ Sessions</span><span>₮ Payments</span>
              <small className="side-label">NETWORK</small>
              <span>⌁ Locations</span><span>◈ Routers</span><span>◎ Hotspots</span>
            </aside>
            <div className="product-main">
              <div className="preview-head"><div><small>NETWORK OPERATIONS</small><h3>Business overview</h3></div><span>● SYSTEM READY</span></div>
              <div className="preview-cards">
                <div><small>ACTIVE SESSIONS</small><strong>Live</strong><em>Customer access</em></div>
                <div><small>PAYMENTS</small><strong>Verified</strong><em>Transaction flow</em></div>
                <div><small>ROUTERS</small><strong>Connected</strong><em>Network access</em></div>
              </div>
              <div className="preview-grid">
                <div className="preview-panel"><small>OPERATING FLOW</small><h4>Customer → Payment → Access</h4><div className="flow"><span>Customer</span><b>→</b><span>Package</span><b>→</b><span>Payment</span><b>→</b><span>Internet</span></div></div>
                <div className="preview-panel"><small>LOCATIONS</small><h4>Sites under management</h4><div className="site-row"><span><i className="green" /> Location A</span><b>Online</b></div><div className="site-row"><span><i className="green" /> Location B</span><b>Online</b></div><div className="site-row"><span><i className="amber" /> Location C</span><b>Attention</b></div></div>
              </div>
              <div className="preview-note"><span>Illustrative product interface</span><b>Connect your actual network and data after sign-in.</b></div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="platform section">
        <div className="section-label">01 / THE PLATFORM</div>
        <div className="section-head"><h2>From the first customer<br /><span>to the whole network.</span></h2><p>JASLYN NET is built around the complete WiFi business loop. The commercial side and the network side live in the same operational system.</p></div>
        <div className="pillar-grid">{pillars.map((item) => <article key={item.number}><small>{item.number}</small><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div>
      </section>

      <section id="workflow" className="workflow section">
        <div className="section-label">02 / HOW IT WORKS</div>
        <div className="workflow-head"><h2>A simple operating loop.<br /><span>A serious network underneath.</span></h2><p>Connect your infrastructure, define what you sell, let customers purchase access, then manage the resulting sessions and revenue from the same place.</p></div>
        <div className="workflow-line">
          <article><span>01</span><b>Connect</b><p>Add locations, routers and network access infrastructure.</p></article>
          <i>→</i>
          <article><span>02</span><b>Configure</b><p>Create packages, access rules, vouchers and customer services.</p></article>
          <i>→</i>
          <article><span>03</span><b>Sell</b><p>Customers choose a package and complete the configured payment flow.</p></article>
          <i>→</i>
          <article><span>04</span><b>Operate</b><p>Track sessions, payments, locations and network activity in one console.</p></article>
        </div>
      </section>

      <section id="network" className="network section-wide">
        <div className="network-copy"><div className="section-label">03 / NETWORK + BILLING</div><h2>Your network is infrastructure.<br /><span>Your business is the operation.</span></h2><p>JASLYN NET connects the two without pretending they are the same thing. Network access, customer services and financial activity remain visible as distinct operational domains inside one platform.</p><div className="checks"><span>✓ MikroTik / RouterOS workflows</span><span>✓ FreeRADIUS-ready authentication</span><span>✓ HotSpot & captive portal operations</span><span>✓ Live sessions & usage visibility</span><span>✓ Payments & reconciliation workflows</span><span>✓ Multi-location operations</span></div></div>
        <div className="network-card"><div className="network-card-top"><span>NETWORK MAP</span><b>OPERATIONS VIEW</b></div><div className="network-visual"><div className="hub"><span>J</span><b>JASLYN NET</b><small>CONTROL PLANE</small></div><div className="node n1"><i />ROUTER 01<small>ONLINE</small></div><div className="node n2"><i />ROUTER 02<small>ONLINE</small></div><div className="node n3"><i className="warn-dot" />ROUTER 03<small>ATTENTION</small></div><div className="line l1" /><div className="line l2" /><div className="line l3" /></div><div className="network-legend"><span><i className="green" /> Connected</span><span><i className="amber" /> Attention</span><span>Sites • Routers • Sessions</span></div></div>
      </section>

      <section className="modules section">
        <div className="section-label">04 / CORE MODULES</div>
        <div className="section-head"><h2>One platform.<br /><span>Every operational layer.</span></h2><p>Each module has a clear job, while shared identity, tenant and business foundations keep the operation connected.</p></div>
        <div className="module-grid">{modules.map(([title, text]) => <article key={title}><span>{title.slice(0, 1)}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>

      <section className="ecosystem section">
        <div className="section-label">05 / WORKS WITH YOUR STACK</div><h2>Use the infrastructure<br /><span>you already understand.</span></h2>
        <div className="integration-grid">{integrations.map((name) => <div key={name}><b>{name.slice(0, 1)}</b><span>{name}</span></div>)}</div>
      </section>

      <section id="pricing" className="plans section">
        <div className="section-label">06 / PLANS</div><div className="plans-head"><h2>Start with your operation.<br /><span>Scale with your network.</span></h2><p>JASLYN NET is designed for operators ranging from a focused hotspot to a growing multi-location network. Commercial plans can be configured around the deployment rather than forcing every operator into the same shape.</p></div>
        <div className="plan-card"><div><small>JASLYN NET</small><h3>Built around the network you actually operate.</h3><p>Choose the modules, locations and operational capacity that match your business. Pricing and onboarding details are presented before activation.</p></div><Link href="/login" className="primary">Open JASLYN NET <span>↗</span></Link></div>
      </section>

      <section className="final"><div className="section-label">07 / START OPERATING</div><h2>Connect. Control. <em>Grow.</em></h2><p>Bring WiFi access, billing, customers and network operations into one place.</p><Link href="/login" className="primary">Enter JASLYN NET <span>→</span></Link></section>

      <footer><Link href="/" className="logo"><span>J</span><b>JASLYN NET</b></Link><p>Connectivity & ISP Operating System.</p><small>© 2026 JASLYN NET · YURIAN TECH LTD</small></footer>

      <style jsx>{`
        .landing{background:#06101c;color:#edf5ff;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.nav{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 5.5vw;border-bottom:1px solid rgba(255,255,255,.08);position:sticky;top:0;z-index:30;background:rgba(6,16,28,.88);backdrop-filter:blur(18px)}.logo{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;letter-spacing:.13em;font-size:12px}.logo span,.side-brand>span{width:30px;height:30px;border:1px solid #54a9ff;border-radius:8px;display:grid;place-items:center;color:#70bcff;font-weight:900}.logo b{font-weight:850}.links{display:flex;gap:28px}.links a,.login{color:#91a5bc;text-decoration:none;font-size:10px}.links a:hover,.login:hover{color:#fff}.nav-actions{display:flex;align-items:center;gap:17px}.nav-cta,.primary{background:#f4f8ff;color:#06101c;text-decoration:none;border-radius:7px;padding:11px 16px;font-weight:800;font-size:10px}.nav-cta span,.primary span{margin-left:7px}.hero{max-width:1240px;margin:auto;padding:105px 5.5vw 85px;position:relative}.hero:before{content:'';position:absolute;width:760px;height:760px;top:-180px;left:50%;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle,rgba(42,132,244,.18),transparent 66%);pointer-events:none}.hero-copy{text-align:center;position:relative;z-index:1}.eyebrow,.section-label{font-size:8px;letter-spacing:.2em;color:#63b5ff;font-weight:850}.eyebrow i{display:inline-block;width:5px;height:5px;border-radius:50%;background:#49c895;margin:0 7px 1px 0}.hero h1{font-size:clamp(48px,6.8vw,86px);line-height:.94;letter-spacing:-.065em;margin:22px 0}.hero h1 em,.section-head h2 span,.workflow-head h2 span,.network-copy h2 span,.modules .section-head h2 span,.ecosystem h2 span,.plans-head h2 span,.final em{font-style:normal;color:#6cbcff}.hero-copy>p{max-width:730px;margin:0 auto;color:#94a8c0;font-size:14px;line-height:1.85}.hero-actions{display:flex;justify-content:center;gap:10px;margin:28px 0}.secondary{border:1px solid rgba(255,255,255,.13);color:#dbe8f7;text-decoration:none;padding:11px 16px;border-radius:7px;font-size:10px}.trust-row{display:flex;justify-content:center;gap:15px;color:#60758e;font-size:8px;margin-top:30px}.trust-row i{width:3px;height:3px;border-radius:50%;background:#52677f;margin-top:4px}.hero-product{margin:58px auto 0;max-width:1100px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:#0a1625;box-shadow:0 45px 120px rgba(0,0,0,.38);overflow:hidden;position:relative;z-index:1}.window-bar{height:44px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;padding:0 15px;color:#688099;font-size:7px;letter-spacing:.08em}.dots{display:flex;gap:5px}.dots i{width:6px;height:6px;border-radius:50%;background:#304257}.secure{color:#4fbc94}.product-shell{display:grid;grid-template-columns:180px 1fr;min-height:430px}.product-shell aside{border-right:1px solid rgba(255,255,255,.06);padding:20px 12px;display:flex;flex-direction:column;gap:5px;color:#71859c;font-size:8px}.side-brand{display:flex;align-items:center;gap:8px;margin:0 4px 20px}.side-brand>span{width:24px;height:24px;border-radius:6px;font-size:9px}.side-brand b,.side-brand small{display:block}.side-brand b{font-size:8px;color:#fff}.side-brand small{font-size:6px;color:#556a82;margin-top:2px}.side-label{font-size:6px;color:#4e637b;letter-spacing:.15em;margin:10px 5px 3px}.product-shell aside>span{padding:8px;border-radius:5px}.product-shell aside>span:hover{background:#102237;color:#fff}.side-active{background:#122b45;color:#fff!important}.product-main{padding:20px}.preview-head{display:flex;justify-content:space-between;align-items:flex-start}.preview-head small,.preview-panel>small{font-size:6px;letter-spacing:.12em;color:#5f7690}.preview-head h3{font-size:17px;margin:6px 0}.preview-head>span{font-size:7px;color:#52c496;background:#0c2a25;padding:6px 8px;border-radius:5px}.preview-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:15px}.preview-cards div,.preview-panel{background:#0d1c2e;border:1px solid rgba(255,255,255,.07);border-radius:8px}.preview-cards div{padding:13px}.preview-cards small{font-size:6px;color:#657b93;letter-spacing:.08em}.preview-cards strong{display:block;font-size:15px;margin:9px 0 3px}.preview-cards em{font-size:7px;color:#6d8299;font-style:normal}.preview-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:8px;margin-top:8px}.preview-panel{padding:14px;min-height:175px}.preview-panel h4{font-size:10px;margin:8px 0 18px}.flow{display:flex;align-items:center;justify-content:space-between;gap:5px}.flow span{background:#102b45;border:1px solid #173c5c;border-radius:6px;padding:9px 7px;color:#c7d9ec;font-size:7px;text-align:center}.flow b{color:#5caeff;font-size:10px}.site-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:8px;color:#b7c7d9}.site-row:last-child{border:0}.site-row b{font-size:7px;color:#55c294}.site-row i,.network-legend i{display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:5px}.green{background:#4bc390}.amber{background:#e0a343}.site-row b:last-child{color:#d6a149}.preview-note{display:flex;justify-content:space-between;gap:15px;margin-top:12px;font-size:7px;color:#586d84}.preview-note b{font-weight:500;color:#71859c}.section{max-width:1220px;margin:auto;padding:105px 5.5vw}.section-head,.workflow-head,.plans-head{display:grid;grid-template-columns:1fr .8fr;gap:70px;margin:22px 0 45px}.section-head h2,.workflow-head h2,.modules .section-head h2,.ecosystem h2,.plans-head h2,.network-copy h2{font-size:43px;line-height:1.02;letter-spacing:-.05em;margin:0}.section-head p,.workflow-head p,.plans-head p,.network-copy>p{color:#8499b0;font-size:11px;line-height:1.9;margin:0}.pillar-grid{display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid rgba(255,255,255,.08)}.pillar-grid article{display:grid;grid-template-columns:40px 1fr;gap:18px;padding:30px 20px 30px 0;border-bottom:1px solid rgba(255,255,255,.08)}.pillar-grid article:nth-child(odd){border-right:1px solid rgba(255,255,255,.08);padding-right:35px}.pillar-grid article:nth-child(even){padding-left:35px}.pillar-grid small{font-size:8px;color:#4f6780}.pillar-grid h3{font-size:17px;margin:0 0 10px}.pillar-grid p{font-size:10px;line-height:1.75;color:#71869d;margin:0;max-width:450px}.workflow{border-top:1px solid rgba(255,255,255,.07);max-width:none;padding-left:8.5vw;padding-right:8.5vw;background:#081524}.workflow-line{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;gap:18px;align-items:center}.workflow-line article{border:1px solid rgba(255,255,255,.08);background:#0b1a2b;border-radius:10px;padding:20px;min-height:140px}.workflow-line article span{font-size:7px;color:#5daeff}.workflow-line article b{display:block;font-size:15px;margin:18px 0 8px}.workflow-line article p{font-size:9px;line-height:1.65;color:#72879e;margin:0}.workflow-line>i{font-style:normal;color:#4f86bb;font-size:15px}.section-wide{padding:110px 8.5vw;display:grid;grid-template-columns:1fr 1fr;gap:75px;border-top:1px solid rgba(255,255,255,.07);background:#07121f}.network-copy h2{margin:20px 0}.checks{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:28px}.checks span{font-size:9px;color:#b8c9dc}.network-card{border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#0b1929;overflow:hidden}.network-card-top{height:45px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.07);font-size:7px;color:#657b93}.network-card-top b{color:#58b994}.network-visual{height:310px;position:relative;background:radial-gradient(circle at center,rgba(53,130,211,.1),transparent 42%),#091725}.hub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:110px;height:82px;border:1px solid #2b6ea5;background:#0e2941;border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2}.hub span{width:25px;height:25px;border:1px solid #61b7ff;border-radius:6px;display:grid;place-items:center;color:#71c0ff;font-size:9px;font-weight:900}.hub b{font-size:7px;margin-top:7px}.hub small{font-size:5px;color:#617a93;margin-top:2px}.node{position:absolute;width:105px;padding:9px;border:1px solid rgba(255,255,255,.09);background:#0c1d30;border-radius:7px;font-size:7px;color:#b9c9da}.node i{display:inline-block;width:5px;height:5px;border-radius:50%;background:#4bc390;margin-right:5px}.node small{display:block;color:#5e768f;font-size:5px;margin:5px 0 0 10px}.n1{left:8%;top:25%}.n2{right:8%;top:25%}.n3{right:12%;bottom:18%}.warn-dot{background:#dfa345!important}.line{position:absolute;height:1px;background:#245a86;transform-origin:left center;opacity:.7}.l1{width:235px;left:28%;top:46%;transform:rotate(-23deg)}.l2{width:235px;left:51%;top:46%;transform:rotate(23deg)}.l3{width:175px;left:56%;top:60%;transform:rotate(29deg)}.network-legend{display:flex;gap:20px;padding:12px 15px;border-top:1px solid rgba(255,255,255,.07);font-size:7px;color:#647a92}.network-legend span:last-child{margin-left:auto}.module-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid rgba(255,255,255,.08);margin-top:40px}.module-grid article{min-height:150px;padding:20px;border-right:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);display:flex;gap:14px}.module-grid article:nth-child(4n){border-right:0}.module-grid article:nth-last-child(-n+4){border-bottom:0}.module-grid article>span{width:25px;height:25px;border-radius:6px;background:#10253b;color:#66b8ff;display:grid;place-items:center;font-size:8px;flex:none}.module-grid h3{font-size:12px;margin:1px 0 8px}.module-grid p{font-size:8px;line-height:1.7;color:#71869e;margin:0}.ecosystem{padding-top:30px}.ecosystem h2{margin:20px 0 40px}.integration-grid{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid rgba(255,255,255,.08)}.integration-grid div{padding:20px 12px;border-right:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:8px}.integration-grid div:last-child{border:0}.integration-grid b{width:24px;height:24px;border-radius:6px;background:#10253b;color:#62b5ff;display:grid;place-items:center;font-size:8px}.integration-grid span{font-size:7px;color:#91a5bc}.plans{border-top:1px solid rgba(255,255,255,.07)}.plan-card{display:flex;align-items:center;justify-content:space-between;gap:35px;padding:30px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:linear-gradient(110deg,#0c1d30,#0a1727)}.plan-card small{font-size:7px;letter-spacing:.15em;color:#5eaeef}.plan-card h3{font-size:19px;margin:10px 0 7px}.plan-card p{max-width:670px;color:#788da4;font-size:9px;line-height:1.7;margin:0}.final{text-align:center;padding:125px 6vw;border-top:1px solid rgba(255,255,255,.07)}.final h2{font-size:58px;line-height:1;letter-spacing:-.06em;margin:18px 0}.final p{color:#8297ae;font-size:11px;margin:0 0 28px}.final .primary{display:inline-block}footer{border-top:1px solid rgba(255,255,255,.08);padding:28px 5.5vw;display:flex;align-items:center;gap:25px}footer p{font-size:8px;color:#647a92;flex:1;margin:0}footer small{font-size:7px;color:#4e6279}@media(max-width:900px){.links{display:none}.nav{padding:0 5vw}.hero{padding-top:80px}.product-shell{grid-template-columns:1fr}.product-shell aside{display:none}.section-head,.workflow-head,.plans-head,.section-wide{grid-template-columns:1fr;gap:25px}.workflow-line{grid-template-columns:1fr}.workflow-line>i{transform:rotate(90deg);justify-self:center}.pillar-grid{grid-template-columns:1fr}.pillar-grid article:nth-child(odd){border-right:0;padding-right:0}.pillar-grid article:nth-child(even){padding-left:0}.module-grid{grid-template-columns:1fr 1fr}.module-grid article:nth-child(4n){border-right:1px solid rgba(255,255,255,.08)}.module-grid article:nth-child(2n){border-right:0}.module-grid article:nth-last-child(-n+4){border-bottom:1px solid rgba(255,255,255,.08)}.module-grid article:nth-last-child(-n+2){border-bottom:0}.integration-grid{grid-template-columns:1fr 1fr}.integration-grid div:nth-child(2n){border-right:0}.network-copy{order:0}.network-card{order:1}.checks{grid-template-columns:1fr}.plan-card{align-items:flex-start;flex-direction:column}.final h2{font-size:43px}}@media(max-width:560px){.nav-actions .login{display:none}.nav-cta{padding:10px 12px}.hero h1{font-size:48px}.hero-copy>p{font-size:12px}.hero-actions{flex-direction:column;align-items:stretch}.primary,.secondary{text-align:center}.trust-row{flex-wrap:wrap;line-height:1.8}.preview-cards,.preview-grid{grid-template-columns:1fr}.preview-note{display:block}.preview-note b{display:block;margin-top:5px}.flow{flex-wrap:wrap}.section,.section-wide{padding:78px 5vw}.section-head h2,.workflow-head h2,.modules .section-head h2,.ecosystem h2,.plans-head h2,.network-copy h2{font-size:35px}.module-grid{grid-template-columns:1fr}.module-grid article{border-right:0!important}.module-grid article:nth-last-child(-n+2){border-bottom:1px solid rgba(255,255,255,.08)}.module-grid article:last-child{border-bottom:0}.integration-grid{grid-template-columns:1fr}.integration-grid div{border-right:0!important}.final{padding:90px 5vw}.final h2{font-size:40px}footer{display:block}footer p{margin:12px 0}.secure{display:none}}
      `}</style>
    </main>
  );
}
