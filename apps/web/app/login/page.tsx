'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Authentication is intentionally not a gate while the deployment environment
    // is being assembled. Keep the login route harmlessly compatible with existing
    // links, but send operators straight to the real dashboard for inspection.
    router.replace('/dashboard');
  }, [router]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#07101f', color: '#eef4ff', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <section style={{ textAlign: 'center', padding: 32 }}>
        <strong style={{ letterSpacing: '.16em' }}>JASLYN NET</strong>
        <p style={{ color: '#8496ad', marginTop: 12 }}>Opening the operations dashboard…</p>
      </section>
    </main>
  );
}
