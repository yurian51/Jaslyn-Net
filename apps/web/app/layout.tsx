import type { Metadata } from 'next';
import './globals.css';
import './console-responsive.css';
import './console-chrome.css';
import './jaslyn-brand.css';
import './console-polish.css';
import './overview.css';
import './auth.css';
import './legal/legal.css';
import './console-system-ui.css';
import './landing.css';
import './premium.css';
import ConsoleChrome from './console-chrome';

export const metadata: Metadata = {
  title: 'JASLYN NET | Connectivity & ISP Operating System',
  description: 'JASLYN NET connects customers, services, payments, sessions and network operations in one connectivity control plane.',
  icons: {
    icon: '/brand/Jaslyn net brand J (1).svg',
    apple: '/brand/Jaslyn net brand J (1).svg',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ConsoleChrome>{children}</ConsoleChrome></body></html>;
}
