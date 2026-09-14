'use client';

import Link from 'next/link';

const capabilities = [
  ['NETWORK COPILOT', 'Jaslyn watches network signals and turns router, session and availability data into operational observations.'],
  ['REVENUE INTELLIGENCE', 'Understand package, customer and payment signals alongside network performance instead of in separate reports.'],
  ['SAFE AUTOMATION', 'Move from observation to authorized action with explicit controls for sensitive network operations.'],
];

export default function JaslynLandingFeature() {
  return (
    <section className="jaslyn-landing-feature" aria-labelledby="jaslyn-landing-title">
      <div className="jlf-glow" />
      <div className="jlf-copy">
        <div className="jlf-label">JASLYN AI · BUILT INTO JASLYN NET</div>
        <h2 id="jaslyn-landing-title">Your WiFi platform gets an <span>intelligent operator.</span></h2>
        <p>Jaslyn is the AI layer inside Jaslyn Net. It connects network telemetry, billing, payments, customers and sessions so operators can understand what is happening before deciding what to do.</p>
        <div className="jlf-actions"><Link href="/login" className="jlf-primary">Open Jaslyn Net <span>→</span></Link><Link href="/login" className="jlf-secondary">Meet Jaslyn in the console</Link></div>
      </div>

      <div className="jlf-console" aria-label="Jaslyn AI network intelligence preview">
        <div className="jlf-console-top"><div><b>J</b><span>JASLYN AI</span><small>NETWORK COPILOT</small></div><i><em /> LIVE WORKSPACE</i></div>
        <div className="jlf-console-body">
          <div className="jlf-signal"><small>JASLYN OBSERVATION</small><strong>Network intelligence starts with real operational data.</strong><p>Router health · active sessions · payments · customers · traffic</p></div>
          <div className="jlf-flow"><span>TELEMETRY</span><b>→</b><span>ANALYZE</span><b>→</b><span>RECOMMEND</span><b>→</b><span>AUTHORIZE</span></div>
          <div className="jlf-mini-grid"><div><small>NETWORK</small><strong>Health signals</strong><span>Routers · APs · sessions</span></div><div><small>BUSINESS</small><strong>Revenue signals</strong><span>Plans · payments · users</span></div><div><small>ACTION</small><strong>Safe execution</strong><span>Approval · audit · verify</span></div></div>
        </div>
      </div>

      <div className="jlf-capabilities">{capabilities.map(([title, detail]) => <article key={title}><span>✦</span><div><strong>{title}</strong><p>{detail}</p></div></article>)}</div>
      <style jsx>{`
        .jaslyn-landing-feature{max-width:1220px;margin:0 auto;padding:100px 6vw;position:relative;overflow:hidden;display:grid;grid-template-columns:1fr 1.05fr;gap:50px;align-items:center;border-top:1px solid rgba(255,255,255,.08)}.jlf-glow{position:absolute;width:520px;height:520px;right:-140px;top:-100px;background:radial-gradient(circle,rgba(67,143,255,.18),transparent 68%);pointer-events:none}.jlf-label{font-size:9px;letter-spacing:.2em;color:#69b9ff;font-weight:800}.jlf-copy h2{font-size:44px;line-height:1.02;letter-spacing:-.05em;margin:18px 0}.jlf-copy h2 span{color:#72bdff}.jlf-copy>p{max-width:500px;color:#8799b0;font-size:12px;line-height:1.85}.jlf-actions{display:flex;gap:9px;margin-top:28px}.jlf-primary,.jlf-secondary{font-size:9px;text-decoration:none;border-radius:7px;padding:11px 14px}.jlf-primary{background:#f3f8ff;color:#07101f;font-weight:800}.jlf-primary span{margin-left:7px}.jlf-secondary{border:1px solid rgba(255,255,255,.12);color:#d9e7f6}.jlf-console{border:1px solid rgba(112,188,255,.18);background:rgba(10,24,41,.9);border-radius:15px;box-shadow:0 30px 80px rgba(0,0,0,.3);position:relative;z-index:1}.jlf-console-top{height:55px;padding:0 17px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between}.jlf-console-top>div{display:flex;align-items:center;gap:8px}.jlf-console-top b{width:25px;height:25px;border-radius:7px;border:1px solid #54afff;color:#6fc0ff;display:grid;place-items:center}.jlf-console-top span{font-size:9px;font-weight:800}.jlf-console-top small{font-size:6px;color:#62758c;margin-left:2px}.jlf-console-top i{font-size:7px;color:#64cfa1;font-style:normal}.jlf-console-top em{display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor;margin-right:5px}.jlf-console-body{padding:20px}.jlf-signal{border:1px solid rgba(112,188,255,.14);background:#0c1b2d;border-radius:10px;padding:18px}.jlf-signal small{font-size:6px;color:#5e7691;letter-spacing:.15em}.jlf-signal strong{display:block;font-size:15px;line-height:1.35;margin:9px 0}.jlf-signal p{font-size:8px;color:#71869e;margin:0}.jlf-flow{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:17px 0;color:#72bcff;font-size:7px;letter-spacing:.07em}.jlf-flow b{color:#526d88}.jlf-mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.jlf-mini-grid div{padding:13px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#0b1829}.jlf-mini-grid small{font-size:6px;color:#5d7189;display:block}.jlf-mini-grid strong{display:block;font-size:9px;margin:8px 0}.jlf-mini-grid span{font-size:7px;color:#71869d}.jlf-capabilities{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;border:1px solid rgba(255,255,255,.08);margin-top:25px}.jlf-capabilities article{display:flex;gap:12px;padding:20px;border-right:1px solid rgba(255,255,255,.08)}.jlf-capabilities article:last-child{border:0}.jlf-capabilities article>span{color:#66baff;font-size:12px}.jlf-capabilities strong{font-size:9px;letter-spacing:.08em}.jlf-capabilities p{color:#74889f;font-size:8px;line-height:1.65;margin:7px 0 0}@media(max-width:850px){.jaslyn-landing-feature{display:block;padding-top:80px}.jlf-console{margin-top:45px}.jlf-capabilities{grid-template-columns:1fr}.jlf-capabilities article{border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}.jlf-capabilities article:last-child{border-bottom:0}.jlf-copy h2{font-size:37px}.jlf-flow{flex-wrap:wrap}.jlf-mini-grid{grid-template-columns:1fr}.jlf-actions{flex-wrap:wrap}}
      `}</style>
    </section>
  );
}
