'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Props = { documentType: 'TERMS_OF_USE' | 'PRIVACY_NOTICE'; documentVersion: string };

export default function LegalAcceptance({ documentType, documentVersion }: Props) {
  const [state, setState] = useState<'signed-out' | 'current' | 'pending' | 'saving' | 'error'>('signed-out');

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    apiFetch<{ documents: Array<{ documentType: string; currentVersion: string; current: boolean }> }>('/auth/legal-acceptance', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((result) => {
      const document = result.documents.find((item) => item.documentType === documentType);
      setState(document?.currentVersion === documentVersion && document.current ? 'current' : 'pending');
    }).catch(() => setState('error'));
  }, [documentType, documentVersion]);

  if (state === 'signed-out') return null;
  if (state === 'current') return <div className="legal-acceptance legal-acceptance-current" role="status">Current version accepted: {documentVersion}</div>;

  async function accept() {
    const token = getAccessToken();
    if (!token) return;
    setState('saving');
    try {
      await apiFetch('/auth/legal-acceptance', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType }),
      });
      setState('current');
    } catch {
      setState('error');
    }
  }

  return <div className={`legal-acceptance ${state === 'error' ? 'legal-acceptance-error' : ''}`} role={state === 'error' ? 'alert' : 'region'}>
    <div><strong>{state === 'error' ? 'Acceptance could not be recorded.' : 'Current version requires acceptance.'}</strong><span>Version {documentVersion} applies to authenticated JASLYN NET users.</span></div>
    <button type="button" onClick={accept} disabled={state === 'saving'}>{state === 'saving' ? 'Recording…' : 'Accept current version'}</button>
  </div>;
}
