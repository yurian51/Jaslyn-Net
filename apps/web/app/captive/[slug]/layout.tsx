'use client';

import { ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';

export default function CaptivePortalLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ slug: string }>();
  const pathname = usePathname();
  const slug = String(params.slug || '');
  const onVoucherPage = pathname.endsWith('/voucher');

  return <>
    {children}
    {!onVoucherPage && slug && <a className="voucher-entry" href={`/captive/${encodeURIComponent(slug)}/voucher`}>
      <span aria-hidden="true">▦</span><span><strong>Una voucher?</strong><small>Ingiza code uunganishe</small></span><b aria-hidden="true">→</b>
    </a>}
    <style jsx global>{`
      .voucher-entry{position:fixed;z-index:50;right:22px;bottom:22px;display:flex;align-items:center;gap:11px;padding:12px 15px;border:1px solid #ccece3;border-radius:16px;background:#fff;color:#13213a;text-decoration:none;box-shadow:0 12px 34px #10234424;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
      .voucher-entry>span:first-child{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:#e5f8f2;color:#167b68;font-size:19px}
      .voucher-entry strong,.voucher-entry small{display:block}.voucher-entry strong{font-size:12px;font-weight:900}.voucher-entry small{margin-top:3px;font-size:10px;color:#748198}.voucher-entry>b{font-size:18px;color:#16866f}
      @media(max-width:520px){.voucher-entry{right:12px;bottom:12px;padding:10px 12px}.voucher-entry>span:first-child{width:32px;height:32px}}
    `}</style>
  </>;
}
