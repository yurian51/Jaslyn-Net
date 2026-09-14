import { redirect } from 'next/navigation';

/**
 * Temporary development access.
 *
 * The authentication UI is intentionally parked while the product is being
 * inspected. The existing authentication implementation is kept out of the
 * visible flow so the dashboard can be reviewed without stopping at login.
 * Restore the authenticated login page before production release.
 */
export default function LoginPage() {
  redirect('/dashboard');
}
