import type { Metadata } from 'next';
import './globals.css';
import './console-responsive.css';
import './console-chrome.css';
import ConsoleChrome from './console-chrome';

export const metadata: Metadata = {
  title: 'JASLYN NET | Network Operations Platform',
  description: 'Network, billing and connectivity operations platform for connected businesses.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ConsoleChrome>{children}</ConsoleChrome></body></html>;
}
