'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '../../lib/auth';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  // During environment assembly, the web app intentionally has no configured API.
  // In that state the dashboard remains inspectable without inventing authentication.
  // Once NEXT_PUBLIC_API_URL exists, production authentication becomes mandatory again.
  const inspectionMode = !process.env.NEXT_PUBLIC_API_URL?.trim();
  const [authorized, setAuthorized] = useState(inspectionMode || process.env.NODE_ENV !== 'production');

  useEffect(() => {
    if (inspectionMode || process.env.NODE_ENV !== 'production') {
      setAuthorized(true);
      return;
    }

    if (getAccessToken()) {
      setAuthorized(true);
      return;
    }

    router.replace('/login');
  }, [inspectionMode, router]);

  if (!authorized) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#07101f', color: '#9aaac0', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12 }}>
        Checking secure access…
      </main>
    );
  }

  return children;
}
