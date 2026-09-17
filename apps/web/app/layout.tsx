import type { Metadata } from 'next';
import './globals.css';
import './console-responsive.css';
import './jaslyn-brand.css';

export const metadata: Metadata = {
  title: 'JASLYN NET | Supreme Hybrid Network Operating Engine',
  description: 'JASLYN NET is a hybrid WiFi billing, AAA, captive portal, payment and network operations platform.',
  icons: {
    icon: '/branding/jaslyn-net-logo.png',
    apple: '/branding/jaslyn-net-logo.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
