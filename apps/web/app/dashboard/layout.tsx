'use client';

import { ReactNode } from 'react';

/**
 * Temporary development access.
 *
 * Authentication is parked while the dashboard is being inspected. The
 * authenticated login flow remains in apps/web/app/login/page.tsx history and
 * should be restored before production access is enabled.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
