import type { Metadata } from 'next';
import './globals.css';
import './console-responsive.css';
import './console-chrome.css';
import './jaslyn-brand.css';
import './console-polish.css';
import './overview.css';
import './auth.css';
import './legal/legal.css';
import ConsoleChrome from './console-chrome';

export const metadata: Metadata = {
  title: 'JASLYN NET | Supreme Hybrid Network Operating Engine',
  description: 'JASLYN NET is a hybrid WiFi billing, AAA, captive portal, payment and network operations platform.',
  icons: {
    icon: '/branding/jaslyn-net-logo.png',
    apple: '/branding/jaslyn-net-logo.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ConsoleChrome>{children}</ConsoleChrome></body></html>;
}
