'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/api';

type PortalPackage = {
  id: string; name: string; tagline?: string | null; price: string | number; currency: string;
  durationSeconds: number; dataLimitBytes?: number | null; downloadBps?: number | null;
  uploadBps?: number | null; isFeatured?: boolean;
};
type PortalData = {
  portal: { name: string; slug: string; currency: string; welcomeMessage: string; termsText: string;
    supportPhone?: string | null; supportEmail?: string | null };
  packages: PortalPackage[];
};
type Filter = 'all' | 'short' | 'day' | 'data';

const duration = (seconds: number) => {
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400} ${seconds / 86400 === 1 ? 'day' : 'days'}`;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} ${seconds / 3600 === 1 ? 'hour' : 'hours'}`;
  return `${Math.max(1, Math.floor(seconds / 60))} minutes`;
};
const dataLimit = (bytes?: number | null) => !bytes ? 'As configured' : bytes >= 1_000_000_000
  ? `${(bytes / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`
  : `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
const speed = (bps?: number | null) => !bps ? 'Standard speed' : `${Math.max(1, Math.round(bps / 1_000_000))} Mbps`;
const money = (pkg: PortalPackage, fallback: string) => `${pkg.currency || fallback} ${Number(pkg.price).toLocaleString()}`;

export default function CaptivePortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState('');
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => { let alive = true; params.then(p => { if (alive) setSlug(p.slug); }); return () => { alive = false; }; }, [params]);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setLoading(true); setError('');
    apiFetch<PortalData>(`/public/captive-portal/${encodeURIComponent(slug)}`)
      .then(result => { if (alive) { setData(result); setSelected(result.packages.find(p => p.isFeatured)?.id || result.packages[0]?.id || ''); } })
      .catch(() => { if (alive) setError('Wi-Fi portal hii haipatikani kwa sasa. Tafadhali wasiliana na msimamizi wa mtandao.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  const packages = useMemo(() => (data?.packages ?? []).filter(pkg => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || pkg.name.toLowerCase().includes(q) || (pkg.tagline ?? '').toLowerCase().includes(q);
    const matchesFilter = filter === 'all' || (filter === 'short' && pkg.durationSeconds < 86400) ||
      (filter === 'day' && pkg.durationSeconds >= 86400) || (filter === 'data' && Boolean(pkg.dataLimitBytes));
    return matchesSearch && matchesFilter;
  }), [data, filter, search]);
  const chosen = data?.packages.find(pkg => pkg.id === selected);

  return <main className="cp-page">
    <div className="cp-wrap">
      <header className="cp-topbar">
        <a className="cp-brand" href="#top" aria-label="Jaslyn Net home">
          <span className="cp-brand-mark">J<span>N</span></span>
          <span><strong>JASLYN NET</strong><small>SMART WI-FI EXPERIENCE</small></span>
        </a>
        <div className="cp-secure"><span className="cp-live-dot" /> NETWORK PORTAL <span className="cp-secure-lock">⌑</span></div>
      </header>

      <section className="cp-hero" id="top">
        <div className="cp-hero-glow" />
        <div className="cp-hero-content">
          <div className="cp-eyebrow"><span className="cp-wifi-icon">⌁</span> WELCOME TO YOUR WI-FI</div>
          <h1>{data?.portal.name || 'Fast Wi-Fi.\\nYour way.'}</h1>
          <p>{data?.portal.welcomeMessage || 'Chagua kifurushi kinachokufaa. Unganisha vifaa vyako na uendelee na mambo muhimu.'}</p>
          <div className="cp-hero-pills"><span>◈ Packages for every budget</span><span>◉ Simple & secure access</span></div>
        </div>
        <div className="cp-orbit" aria-hidden="true"><div className="cp-orbit-core">JN</div><i /><b /><em /></div>
        <div className="cp-hero-bottom"><span><i /> CONNECTION OPTIONS</span><span>{data ? `${data.packages.length} PACKAGES AVAILABLE` : 'CHOOSE YOUR ACCESS'}</span></div>
      </section>

      <section className="cp-section">
        <div className="cp-section-heading">
          <div><span className="cp-overline">FIND YOUR PLAN</span><h2>Choose your connection</h2><p>Bei na muda vimewekwa wazi kabla ya kuchagua.</p></div>
          <div className="cp-plan-count"><strong>{data?.packages.length ?? '—'}</strong><span>PLANS</span></div>
        </div>

        {loading && <div className="cp-loading" role="status"><span className="cp-spinner" /> Tunapakia vifurushi vya mtandao…</div>}
        {error && <div className="cp-error" role="alert"><strong>Portal haipatikani</strong><span>{error}</span><button onClick={() => { if (slug) { setLoading(true); setError(''); apiFetch<PortalData>(`/public/captive-portal/${encodeURIComponent(slug)}`).then(setData).catch(() => setError('Imeshindikana kupakia. Jaribu tena baadaye.')).finally(() => setLoading(false)); } }}>Jaribu tena</button></div>}
        {!loading && data && <>
          <div className="cp-tools">
            <label className="cp-search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tafuta kifurushi…" aria-label="Tafuta kifurushi" /></label>
            <div className="cp-filters" aria-label="Chuja vifurushi">
              {([['all','Vyote'],['short','Saa'],['day','Siku+'],['data','Data'] ] as [Filter,string][]).map(([key,label]) =>
                <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
            </div>
          </div>

          {packages.length === 0 ? <div className="cp-empty"><span>⌕</span><strong>Hakuna kifurushi kilichopatikana</strong><p>Badili utafutaji au kichujio ujaribu tena.</p><button onClick={() => { setSearch(''); setFilter('all'); }}>Onyesha vyote</button></div> :
            <div className="cp-package-grid">
              {packages.map((pkg, index) => <article key={pkg.id} className={`cp-package ${selected === pkg.id ? 'is-selected' : ''} ${pkg.isFeatured ? 'is-featured' : ''}`}>
                {pkg.isFeatured && <div className="cp-popular">★ INAYOPENDEKEZWA</div>}
                <div className="cp-package-top"><span className="cp-package-index">{String(index + 1).padStart(2, '0')}</span><span className="cp-plan-symbol">{pkg.durationSeconds >= 86400 ? '◷' : '⌁'}</span>
                  {selected === pkg.id && <span className="cp-selected-mark">✓</span>}</div>
                <h3>{pkg.name}</h3>
                <p className="cp-tagline">{pkg.tagline || 'Wi-Fi ya kuaminika kwa mahitaji yako ya kila siku.'}</p>
                <div className="cp-price">{money(pkg, data.portal.currency)}<small>/ {duration(pkg.durationSeconds)}</small></div>
                <div className="cp-specs"><div><span>◉</span><span><small>DATA</small><strong>{dataLimit(pkg.dataLimitBytes)}</strong></span></div><div><span>↯</span><span><small>DOWNLOAD</small><strong>{speed(pkg.downloadBps)}</strong></span></div></div>
                <button className={selected === pkg.id ? 'cp-select-button chosen' : 'cp-select-button'} onClick={() => setSelected(pkg.id)} aria-pressed={selected === pkg.id}>
                  {selected === pkg.id ? 'Kifurushi kimechaguliwa ✓' : 'Chagua kifurushi'} <span>→</span>
                </button>
              </article>)}
            </div>
          }
        </>}

        {!loading && data && data.packages.length === 0 && <div className="cp-no-plans"><span>◌</span><strong>Vifurushi vinatayarishwa</strong><p>Kwa sasa hakuna kifurushi kilichowekwa hadharani. Wasiliana na msimamizi wa mtandao kwa msaada.</p></div>}
      </section>

      {data && <section className="cp-next-step">
        <div className="cp-next-icon">↗</div><div className="cp-next-copy"><span className="cp-overline">HATUA INAYOFUATA</span><h2>{chosen ? chosen.name : 'Tayari kuanza?'}</h2><p>{chosen ? `${money(chosen, data.portal.currency)} · ${duration(chosen.durationSeconds)} · ${dataLimit(chosen.dataLimitBytes)}` : 'Chagua kifurushi hapo juu ili kuona muhtasari wake.'}</p><small>Uchaguzi huu ni wa muhtasari tu. Malipo na kuidhinisha kifaa lazima viunganishwe na mfumo wa malipo na vifaa vya mtandao vya mtoa huduma.</small></div>
        {chosen && <div className="cp-selected-price"><span>BEI YA KIFURUSHI</span><strong>{money(chosen, data.portal.currency)}</strong></div>}
      </section>}

      {data && <section className="cp-help-grid">
        <article className="cp-help-card"><span className="cp-help-icon">▦</span><div><h3>Una voucher?</h3><p>Uliza msimamizi wa Wi-Fi jinsi ya kutumia voucher au kupata msaada wa kuunganisha.</p></div></article>
        <article className="cp-help-card"><span className="cp-help-icon">◌</span><div><h3>Unahitaji msaada?</h3><p>Wasiliana nasi kuhusu malipo, kifurushi au tatizo la kuunganisha.</p><div className="cp-support-links">{data.portal.supportPhone && <a href={`tel:${data.portal.supportPhone}`}>Piga simu ↗</a>}{data.portal.supportEmail && <a href={`mailto:${data.portal.supportEmail}`}>Tuma barua pepe ↗</a>}</div></div></article>
      </section>}

      {data && <section className="cp-terms"><button onClick={() => setTermsOpen(v => !v)} aria-expanded={termsOpen}><span><span className="cp-terms-icon">ⓘ</span><span><strong>Vigezo na masharti</strong><small>Soma masharti ya matumizi ya mtandao</small></span></span><b>{termsOpen ? '−' : '+'}</b></button>{termsOpen && <p>{data.portal.termsText}</p>}</section>}
      <footer className="cp-footer"><div className="cp-footer-brand"><span className="cp-brand-mark">J<span>N</span></span><span><strong>JASLYN NET</strong><small>CONNECTING PEOPLE. POWERING POSSIBILITIES.</small></span></div><span>© {new Date().getFullYear()} Jaslyn Net <i /> Smart access, made simple.</span></footer>
    </div>

    <style jsx>{`
      .cp-page{min-height:100vh;background:#f3f6fb;color:#13213a;padding:0 20px 36px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .cp-wrap{max-width:1040px;margin:0 auto}.cp-topbar{height:76px;display:flex;align-items:center;justify-content:space-between;gap:12px}
      .cp-brand,.cp-footer-brand{display:flex;align-items:center;gap:10px;color:#15223b}.cp-brand-mark{height:37px;width:37px;border-radius:12px;background:#10203d;color:#fff;display:grid;place-items:center;font-size:16px;font-weight:900;letter-spacing:-2px;box-shadow:0 5px 15px #10203d20}.cp-brand-mark span{color:#54d6b1}.cp-brand strong,.cp-brand small,.cp-footer-brand strong,.cp-footer-brand small{display:block}.cp-brand strong,.cp-footer-brand strong{font-size:12px;font-weight:900;letter-spacing:.12em}.cp-brand small,.cp-footer-brand small{font-size:8px;letter-spacing:.13em;color:#8390a4;margin-top:4px;font-weight:700}
      .cp-secure{display:flex;align-items:center;gap:8px;font-size:9px;letter-spacing:.12em;color:#64748b;font-weight:800}.cp-live-dot,.cp-hero-bottom i{height:7px;width:7px;border-radius:50%;background:#27c48b;box-shadow:0 0 0 4px #27c48b1b}.cp-secure-lock{font-size:19px;color:#1f9b74}
      .cp-hero{position:relative;overflow:hidden;min-height:300px;border-radius:25px;background:linear-gradient(118deg,#0b1730 0%,#122c52 58%,#15556a 100%);color:white;padding:37px 40px 0;box-shadow:0 18px 40px #1023441c}.cp-hero-glow{position:absolute;width:380px;height:380px;right:3%;top:-200px;border-radius:50%;background:#3c9bba30;filter:blur(5px)}.cp-hero-content{position:relative;z-index:2;max-width:590px;padding-bottom:42px}.cp-eyebrow{display:flex;align-items:center;gap:9px;font-size:9px;letter-spacing:.19em;font-weight:850;color:#9cb9d8}.cp-wifi-icon{display:grid;place-items:center;border:1px solid #4b769c;border-radius:8px;width:28px;height:28px;font-size:24px;color:#70e1c2}.cp-hero h1{white-space:pre-line;margin:20px 0 11px;font-size:clamp(32px,5vw,49px);line-height:1.04;letter-spacing:-.055em;font-weight:850;max-width:590px}.cp-hero p{max-width:490px;margin:0;color:#c2d1e3;font-size:13px;line-height:1.75}.cp-hero-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:21px}.cp-hero-pills span{padding:8px 11px;border-radius:9px;border:1px solid #ffffff20;background:#ffffff0b;color:#d5e3f3;font-size:9px;font-weight:650}.cp-orbit{position:absolute;right:8%;top:48px;width:200px;height:200px;border:1px solid #8ac2d43b;border-radius:50%;display:grid;place-items:center;opacity:.85}.cp-orbit:before,.cp-orbit:after{content:"";position:absolute;inset:17px;border:1px solid #8ac2d42d;border-radius:50%}.cp-orbit:after{inset:40px}.cp-orbit-core{display:grid;place-items:center;width:70px;height:70px;border-radius:23px;background:linear-gradient(145deg,#57d9bc,#2c9fbc);color:#0c2740;font-size:24px;font-weight:950;letter-spacing:-3px;box-shadow:0 0 50px #47d7c74d}.cp-orbit i,.cp-orbit b,.cp-orbit em{position:absolute;width:10px;height:10px;border-radius:50%;background:#75e6ce;box-shadow:0 0 0 6px #75e6ce18}.cp-orbit i{top:22px;left:42px}.cp-orbit b{right:10px;top:100px;background:#a8c6ff}.cp-orbit em{left:36px;bottom:20px;background:#fff}.cp-hero-bottom{position:relative;z-index:2;height:43px;border-top:1px solid #ffffff1b;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#9cb4ce;font-size:8px;letter-spacing:.12em;font-weight:800}.cp-hero-bottom span:first-child{display:flex;align-items:center;gap:8px}
      .cp-section{padding:34px 0 0}.cp-section-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}.cp-overline{display:block;color:#168e79;font-size:9px;letter-spacing:.17em;font-weight:900}.cp-section-heading h2,.cp-next-copy h2{margin:7px 0 5px;font-size:25px;line-height:1.15;letter-spacing:-.045em;color:#14213a}.cp-section-heading p,.cp-next-copy p{margin:0;color:#7b899c;font-size:11px;line-height:1.6}.cp-plan-count{display:grid;place-items:center;min-width:62px;height:62px;border:1px solid #dfe7f0;border-radius:17px;background:#fff}.cp-plan-count strong{font-size:21px;color:#162b4b;line-height:1}.cp-plan-count span{font-size:8px;color:#8996a8;letter-spacing:.13em;font-weight:800}.cp-tools{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px}.cp-search{height:42px;display:flex;align-items:center;gap:10px;padding:0 13px;border:1px solid #e0e7f0;background:#fff;border-radius:11px;min-width:180px;max-width:340px;flex:1;color:#8190a5}.cp-search>span{font-size:22px}.cp-search input{border:0;outline:0;min-width:0;width:100%;color:#182844;background:transparent;font-size:11px}.cp-filters{display:flex;gap:4px;padding:4px;background:#e9eef5;border-radius:11px}.cp-filters button{padding:8px 12px;border-radius:8px;color:#69788d;font-size:10px;font-weight:750}.cp-filters button.active{background:#fff;color:#145b8c;box-shadow:0 2px 6px #0f274010}
      .cp-package-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.cp-package{position:relative;min-width:0;background:#fff;border:1px solid #e0e7f0;border-radius:17px;padding:18px 17px 16px;box-shadow:0 5px 18px #12264707;transition:border-color .15s,transform .15s,box-shadow .15s}.cp-package:hover{transform:translateY(-2px);box-shadow:0 12px 26px #12264710}.cp-package.is-selected{border-color:#269d8c;box-shadow:0 0 0 2px #269d8c16,0 9px 22px #12264709}.cp-package.is-featured{border-color:#b6c9e6}.cp-popular{position:absolute;top:0;right:0;padding:7px 9px;background:#e9f7f3;color:#167b69;border-radius:0 16px 0 10px;font-size:7px;letter-spacing:.06em;font-weight:900}.cp-package-top{display:flex;align-items:center;gap:8px;margin-bottom:15px}.cp-package-index{font-size:9px;font-weight:900;color:#9ba8b9;letter-spacing:.12em}.cp-plan-symbol{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;background:#eef5ff;color:#3168c8;font-size:22px}.cp-selected-mark{margin-left:auto;display:grid;place-items:center;width:21px;height:21px;border-radius:50%;background:#e0f7ed;color:#158461;font-size:12px;font-weight:900}.cp-package h3{margin:0 0 5px;color:#152540;font-size:16px;font-weight:850;letter-spacing:-.025em}.cp-tagline{min-height:32px;margin:0;color:#8491a3;font-size:10px;line-height:1.6}.cp-price{margin:18px 0 15px;color:#122443;font-size:25px;font-weight:900;letter-spacing:-.05em;overflow-wrap:anywhere}.cp-price small{display:block;margin-top:4px;color:#8a96a7;font-size:9px;font-weight:650;letter-spacing:0}.cp-specs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 0;border-top:1px solid #edf1f5;border-bottom:1px solid #edf1f5}.cp-specs>div{display:flex;align-items:center;gap:7px;min-width:0}.cp-specs>div>span:first-child{color:#218d80;font-size:16px}.cp-specs small,.cp-specs strong{display:block}.cp-specs small{font-size:7px;letter-spacing:.1em;color:#9aa5b4;font-weight:800}.cp-specs strong{margin-top:4px;font-size:9px;color:#34445d;overflow-wrap:anywhere}.cp-select-button{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;margin-top:14px;padding:11px 12px;border-radius:9px;background:#f3f6fb;color:#445570;font-size:10px;font-weight:800;text-align:left}.cp-select-button span{font-size:15px}.cp-select-button.chosen{background:#e9f7f2;color:#167d68}.cp-loading{display:flex;align-items:center;gap:10px;padding:28px;color:#73839a;font-size:12px}.cp-spinner{width:17px;height:17px;border:2px solid #d9e5ef;border-top-color:#188e7b;border-radius:50%;animation:cp-spin .8s linear infinite}@keyframes cp-spin{to{transform:rotate(360deg)}}.cp-error,.cp-empty,.cp-no-plans{display:grid;justify-items:center;gap:9px;padding:34px 20px;background:#fff;border:1px solid #e1e8f0;border-radius:16px;text-align:center}.cp-error strong,.cp-empty strong,.cp-no-plans strong{font-size:14px}.cp-error span,.cp-empty p,.cp-no-plans p{max-width:420px;margin:0;color:#7b899d;font-size:11px;line-height:1.7}.cp-error button,.cp-empty button{margin-top:7px;padding:10px 14px;border-radius:9px;background:#142c4e;color:#fff;font-size:10px;font-weight:800}.cp-empty>span,.cp-no-plans>span{font-size:30px;color:#178d7b}.cp-no-plans{margin-top:15px}
      .cp-next-step{display:flex;align-items:center;gap:15px;margin-top:23px;padding:20px;background:linear-gradient(100deg,#10203b,#183c5a);border-radius:17px;color:#fff}.cp-next-icon{display:grid;place-items:center;flex:0 0 44px;width:44px;height:44px;border:1px solid #ffffff2b;border-radius:13px;background:#ffffff10;color:#7ce0c7;font-size:24px}.cp-next-copy{flex:1;min-width:0}.cp-next-copy .cp-overline{color:#72d7bf}.cp-next-copy h2{margin:5px 0;color:#fff;font-size:17px}.cp-next-copy p{color:#c2d2e2}.cp-next-copy small{display:block;margin-top:7px;color:#9eb5cc;font-size:9px;line-height:1.6}.cp-selected-price{padding-left:16px;border-left:1px solid #ffffff28;white-space:nowrap}.cp-selected-price span,.cp-selected-price strong{display:block}.cp-selected-price span{font-size:7px;letter-spacing:.1em;color:#a8bed4;font-weight:800}.cp-selected-price strong{margin-top:7px;font-size:17px;color:#fff}
      .cp-help-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:13px}.cp-help-card{display:flex;gap:12px;padding:17px;background:#fff;border:1px solid #e1e8f0;border-radius:14px}.cp-help-icon{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:10px;background:#eef5f9;color:#238a80;font-size:19px}.cp-help-card h3{margin:1px 0 5px;font-size:12px;color:#20304b}.cp-help-card p{margin:0;color:#8390a2;font-size:10px;line-height:1.65}.cp-support-links{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px}.cp-support-links a{color:#167e70;font-size:10px;font-weight:800}.cp-terms{margin-top:13px;border:1px solid #e1e8f0;border-radius:13px;background:#fff;overflow:hidden}.cp-terms>button{display:flex;justify-content:space-between;align-items:center;width:100%;padding:15px 17px;text-align:left}.cp-terms>button>span{display:flex;align-items:center;gap:10px}.cp-terms-icon{display:grid;place-items:center;width:31px;height:31px;border-radius:9px;background:#f0f4fa;color:#617a9a;font-size:17px}.cp-terms strong,.cp-terms small{display:block}.cp-terms strong{font-size:11px;color:#31415a}.cp-terms small{margin-top:4px;font-size:9px;color:#8995a6}.cp-terms b{font-size:20px;color:#8290a4;font-weight:500}.cp-terms>p{white-space:pre-wrap;margin:0;padding:0 18px 17px;color:#6e7d91;font-size:11px;line-height:1.8}.cp-footer{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:27px;padding-top:17px;border-top:1px solid #e0e7f0}.cp-footer-brand .cp-brand-mark{width:31px;height:31px;border-radius:9px;font-size:13px}.cp-footer-brand strong{font-size:10px}.cp-footer-brand small{font-size:7px}.cp-footer>span{display:flex;align-items:center;gap:8px;color:#98a4b4;font-size:9px}.cp-footer>span i{width:3px;height:3px;background:#9aa7b7;border-radius:50%}
      @media(max-width:760px){.cp-page{padding:0 13px 24px}.cp-topbar{height:65px}.cp-secure{font-size:7px;gap:5px}.cp-brand-mark{width:33px;height:33px}.cp-brand strong{font-size:10px}.cp-brand small{font-size:7px}.cp-hero{padding:27px 22px 0;min-height:270px;border-radius:20px}.cp-hero-content{max-width:100%;padding-bottom:28px}.cp-hero h1{font-size:34px;max-width:350px}.cp-hero p{max-width:400px;font-size:12px}.cp-hero-pills{gap:6px}.cp-hero-pills span{font-size:8px;padding:7px 8px}.cp-orbit{right:-62px;top:27px;width:155px;height:155px;opacity:.32}.cp-orbit-core{width:54px;height:54px;font-size:18px}.cp-hero-bottom{font-size:7px}.cp-section{padding-top:27px}.cp-section-heading h2{font-size:22px}.cp-section-heading p{font-size:10px}.cp-plan-count{min-width:52px;height:52px}.cp-tools{align-items:stretch;flex-direction:column}.cp-search{max-width:none;height:42px}.cp-filters{align-self:flex-start}.cp-filters button{padding:8px 14px}.cp-package-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.cp-package{padding:14px 12px 12px;border-radius:14px}.cp-package h3{font-size:14px}.cp-tagline{font-size:9px;min-height:42px}.cp-price{font-size:22px;margin:15px 0 12px}.cp-price small{font-size:8px}.cp-specs{gap:5px}.cp-specs>div{gap:4px}.cp-specs strong{font-size:8px}.cp-specs small{font-size:6px}.cp-popular{font-size:6px;padding:6px}.cp-select-button{font-size:9px;padding:10px 9px}.cp-next-step{padding:15px;gap:11px;align-items:flex-start}.cp-next-icon{flex-basis:35px;width:35px;height:35px;font-size:19px}.cp-next-copy h2{font-size:15px}.cp-selected-price{display:none}.cp-help-grid{grid-template-columns:1fr;gap:9px}.cp-footer{align-items:flex-start;flex-direction:column}.cp-footer>span{font-size:8px}}
      @media(max-width:370px){.cp-package-grid{grid-template-columns:1fr}.cp-tagline{min-height:0}.cp-hero h1{font-size:30px}.cp-hero-pills{flex-direction:column;align-items:flex-start}.cp-filters{width:100%;justify-content:space-between}.cp-filters button{padding:8px 10px}}
      @media(prefers-reduced-motion:reduce){.cp-package,.cp-spinner{animation:none;transition:none}.cp-package:hover{transform:none}}
    `}</style>
  </main>;
}
