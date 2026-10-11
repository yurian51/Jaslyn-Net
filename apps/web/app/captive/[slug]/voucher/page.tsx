'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '../../../../lib/api';

type PortalSummary = { portal: { name: string; slug: string } };
type RedemptionResult = { redeemed: boolean; purchaseId: string; startsAt: string; endsAt: string; deviceLimit: number; message: string };

function normalizePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (/^0\d{9}$/.test(compact)) return `+255${compact.slice(1)}`;
  if (/^255\d{9}$/.test(compact)) return `+${compact}`;
  return compact;
}

export default function PublicVoucherPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug || '');
  const [portalName, setPortalName] = useState('JASLYN NET');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RedemptionResult | null>(null);

  useEffect(() => {
    if (!slug) return;
    apiFetch<PortalSummary>(`/public/captive-portal/${encodeURIComponent(slug)}`)
      .then((data) => setPortalName(data.portal.name))
      .catch(() => setError('Portal haipatikani kwa sasa. Wasiliana na msimamizi wa mtandao.'));
  }, [slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch<RedemptionResult>(`/public/captive-portal/${encodeURIComponent(slug)}/vouchers/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), phone: normalizePhone(phone), code: code.trim().toUpperCase() }),
      });
      setResult(data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Imeshindikana kutumia voucher. Hakiki taarifa kisha ujaribu tena.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="voucher-page">
    <section className="voucher-card">
      <a className="back-link" href={`/captive/${encodeURIComponent(slug)}`}>← Rudi kwenye vifurushi</a>
      <div className="brand-mark">JN</div>
      <p className="eyebrow">WI-FI SELF SERVICE</p>
      <h1>Tumia voucher yako</h1>
      <p className="intro">Unganisha voucher na namba yako ya simu ili kuanzisha ruhusa ya kifurushi kwenye mtandao wa {portalName}.</p>
      {result ? <div className="success" role="status">
        <strong>Voucher imekubaliwa</strong>
        <p>{result.message}</p>
        <dl><div><dt>Muda unaoanza</dt><dd>{new Date(result.startsAt).toLocaleString()}</dd></div><div><dt>Inaisha</dt><dd>{new Date(result.endsAt).toLocaleString()}</dd></div><div><dt>Vifaa vinavyoruhusiwa</dt><dd>{result.deviceLimit}</dd></div></dl>
        <p className="hint">Ikiwa intaneti haijaanza, subiri kwa muda mfupi au wasiliana na mtoa huduma. Mfumo hautathibitisha muunganisho wa kifaa mpaka router itume hali yake halisi.</p>
        <button type="button" onClick={() => { setResult(null); setCode(''); }}>Tumia voucher nyingine</button>
      </div> : <form onSubmit={submit}>
        <label>Jina kamili<input required minLength={2} maxLength={120} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mfano: Amina Juma" /></label>
        <label>Namba ya simu<input required minLength={7} maxLength={32} inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX au +255 7XX XXX XXX" /></label>
        <label>Voucher code<input required minLength={6} maxLength={32} autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="INGIZA CODE" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Inathibitisha voucher…' : 'Thibitisha na kuunganisha →'}</button>
        <p className="hint">Jaribio la voucher limewekewa kikomo kwa usalama. Voucher lazima iwe halali, haijatumika na haijaisha muda wake.</p>
      </form>}
      <footer>© {new Date().getFullYear()} Jaslyn Net · Connect. Control. Grow.</footer>
    </section>
    <style jsx>{`
      .voucher-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 15% 5%,#d9f8f0 0,transparent 34%),linear-gradient(135deg,#f4f7fb,#e8eef7);color:#14213a;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
      .voucher-card{width:min(100%,510px);background:#fff;border:1px solid #e0e8f1;border-radius:26px;padding:30px;box-shadow:0 24px 70px #10234417}
      .back-link{display:inline-block;color:#287c70;font-size:13px;font-weight:750;text-decoration:none;margin-bottom:25px}
      .brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#10203d;color:#55d7b0;font-weight:900;font-size:18px;letter-spacing:-2px}
      .eyebrow{margin:22px 0 7px;font-size:10px;font-weight:900;letter-spacing:.17em;color:#18866f}
      h1{margin:0;font-size:clamp(27px,6vw,36px);letter-spacing:-.04em}
      .intro{color:#68778d;font-size:14px;line-height:1.7;margin:12px 0 24px}
      form{display:grid;gap:16px}label{display:grid;gap:7px;font-size:12px;font-weight:800;color:#33445e}
      input{width:100%;box-sizing:border-box;border:1px solid #d9e2ee;border-radius:12px;padding:14px 13px;background:#fbfcfe;color:#13213a;font:inherit;font-size:15px;outline:none}
      input:focus{border-color:#269c83;box-shadow:0 0 0 3px #269c831a}
      button{border:0;border-radius:12px;padding:14px 16px;background:#102b4b;color:#fff;font:inherit;font-weight:850;cursor:pointer}
      button:disabled{opacity:.6;cursor:wait}.error{margin:0;padding:12px;border-radius:10px;background:#fff0f0;color:#a32323;font-size:13px;line-height:1.5}
      .hint{font-size:11px;color:#7b8798;line-height:1.6;margin:0}
      .success{padding:16px;border:1px solid #b9eadc;background:#f2fcf8;border-radius:15px;color:#145b4d}.success strong{font-size:17px}.success p{font-size:13px;line-height:1.6}
      dl{display:grid;gap:8px}dl div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #d9f0e8;padding-bottom:8px;font-size:12px}dt{color:#56776f}dd{margin:0;font-weight:800;text-align:right}
      footer{margin-top:28px;text-align:center;color:#8a96a8;font-size:10px}
      @media(max-width:480px){.voucher-page{padding:12px}.voucher-card{padding:22px;border-radius:20px}}
    `}</style>
  </main>;
}
