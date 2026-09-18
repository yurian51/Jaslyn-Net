import type { Metadata } from 'next';
import './globals.css';
import './console-responsive.css';
import './console-chrome.css';
import './console-polish.css';
import './overview.css';
import './auth.css';
import './legal/legal.css';
import ConsoleChrome from './console-chrome';

export const metadata: Metadata = {
  title: 'JASLYN NET | Network Operations Platform',
  description: 'JASLYN NET is a network, billing and connectivity operations platform for connected businesses.',
  icons: { icon: '/brand/jaslyn-net-icon.svg', shortcut: '/brand/jaslyn-net-icon.svg', apple: '/brand/jaslyn-net-icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ConsoleChrome>{children}</ConsoleChrome></body></html>;
}
