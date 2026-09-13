import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JASLYN NET | Network Operations Platform',
  description: 'Network, billing and connectivity operations platform for connected businesses.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
