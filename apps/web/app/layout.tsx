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
import './landing-premium.css';
import './loading.css';
import './settings/settings.css';
import './account/account.css';
import './notifications/notifications.css';
import './network/network.css';
import './access-network/access-network.css';
import './fiber/fiber.css';
import ConsoleChrome from './console-chrome';

export const metadata: Metadata = {
  title: 'JASLYN NET | Connectivity & ISP Operating System',
  description: 'JASLYN NET connects customers, services, payments, sessions and network operations in one connectivity control plane.',
  icons: {
    icon: '/ram-logo-scalable.svg',
    apple: '/ram-logo-scalable.svg',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ConsoleChrome>{children}</ConsoleChrome></body></html>;
}
