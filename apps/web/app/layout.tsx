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
  icons: { icon: '/brand/file_000000006450821195473e1e14153e8a.svg', shortcut: '/brand/file_000000006450821195473e1e14153e8a.svg', apple: '/brand/file_000000006450821195473e1e14153e8a.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ConsoleChrome>{children}</ConsoleChrome></body></html>;
}
