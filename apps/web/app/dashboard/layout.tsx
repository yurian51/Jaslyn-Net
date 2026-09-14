'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '../../lib/auth';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(process.env.NODE_ENV !== 'production');

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      setAuthorized(true);
      return;
    }

    if (getAccessToken()) {
      setAuthorized(true);
      return;
    }

    router.replace('/login');
  }, [router]);

  if (!authorized) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#07101f', color: '#9aaac0', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12 }}>
        Checking secure access…
      </main>
    );
  }

  return children;
}
