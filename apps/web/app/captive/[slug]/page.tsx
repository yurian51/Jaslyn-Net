'use client';

import { useEffect, useState } from 'react';
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
const duration = (seconds: number) => seconds % 86400 === 0 ? `${seconds / 86400} day(s)` :
  seconds % 3600 === 0 ? `${seconds / 3600} hour(s)` : `${Math.max(1, Math.floor(seconds / 60))} minutes`;
const dataLimit = (bytes?: number | null) => !bytes ? 'No data cap shown' : `${(bytes / 1_000_000_000).toFixed(1)} GB`;
const speed = (bps?: number | null) => !bps ? 'Speed as configured' : `${Math.round(bps / 1_000_000)} Mbps`;

export default function CaptivePortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState('');
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { let alive = true; params.then(p => { if (alive) setSlug(p.slug); }); return () => { alive = false; }; }, [params]);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setLoading(true); setError('');
    apiFetch<PortalData>(`/public/captive-portal/${encodeURIComponent(slug)}`)
      .then(result => { if (alive) setData(result); })
      .catch(() => { if (alive) setError('This Wi-Fi portal is unavailable. Please contact the network operator.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  return <main style={{minHeight:'100vh',background:'#f3f6fb',padding:'24px 16px',color:'#101828'}}>
    <div style={{maxWidth:520,margin:'0 auto'}}>
      <header style={{background:'#101b35',color:'#fff',borderRadius:24,padding:'28px 24px',marginBottom:18}}>
        <p style={{fontSize:12,letterSpacing:2,fontWeight:800,opacity:.8,margin:'0 0 10px'}}>JASLYN NET • WI-FI ACCESS</p>
        <h1 style={{fontSize:30,lineHeight:1.12,margin:'0 0 12px',fontWeight:850}}>{data?.portal.name || 'Connect to Wi-Fi'}</h1>
        <p style={{margin:0,lineHeight:1.6,opacity:.9}}>{data?.portal.welcomeMessage || 'Choose an available package to get connected.'}</p>
      </header>
      {loading && <p role="status">Loading available packages…</p>}
      {error && <section role="alert" style={{background:'#fff',padding:18,borderRadius:16}}>{error}</section>}
      {data && <>
        <h2 style={{fontSize:20,margin:'22px 0 12px'}}>Available packages</h2>
        {data.packages.length === 0 && <p>No packages are currently available. Please contact the operator.</p>}
        <div style={{display:'grid',gap:12}}>
          {data.packages.map(pkg => <article key={pkg.id} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:18,padding:18,boxShadow:'0 4px 18px rgba(16,24,40,.04)'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}>
              <div><h3 style={{margin:'0 0 6px',fontSize:18}}>{pkg.name}</h3>{pkg.tagline && <p style={{margin:'0 0 8px',color:'#475467'}}>{pkg.tagline}</p>}</div>
              {pkg.isFeatured && <span style={{background:'#e8f2ff',color:'#175cd3',borderRadius:20,padding:'5px 9px',fontSize:11,fontWeight:800}}>POPULAR</span>}
            </div>
            <p style={{fontSize:26,fontWeight:850,margin:'10px 0'}}>{pkg.currency || data.portal.currency} {Number(pkg.price).toLocaleString()}</p>
            <p style={{margin:'5px 0',color:'#475467',fontSize:14}}>{duration(Number(pkg.durationSeconds))} · {dataLimit(pkg.dataLimitBytes)}</p>
            <p style={{margin:'5px 0',color:'#475467',fontSize:14}}>Download {speed(pkg.downloadBps)} · Upload {speed(pkg.uploadBps)}</p>
            <p style={{fontSize:12,color:'#667085',margin:'14px 0 0'}}>Online purchase and activation must be enabled by the network operator.</p>
          </article>)}
        </div>
        <section style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:18,padding:18,marginTop:18}}>
          <h2 style={{fontSize:18,margin:'0 0 8px'}}>Terms of use</h2><p style={{whiteSpace:'pre-wrap',lineHeight:1.6,color:'#475467',margin:0}}>{data.portal.termsText}</p>
          {(data.portal.supportPhone || data.portal.supportEmail) && <p style={{margin:'14px 0 0',fontSize:14}}>Support: {[data.portal.supportPhone,data.portal.supportEmail].filter(Boolean).join(' · ')}</p>}
        </section>
      </>}
      <footer style={{textAlign:'center',fontSize:12,color:'#667085',padding:'22px 0'}}>Powered by JASLYN NET</footer>
    </div>
  </main>;
}
