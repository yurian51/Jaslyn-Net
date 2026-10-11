import type { Metadata, Viewport } from 'next';
import './globals.css';
import './console-responsive.css';
import './console-chrome.css';
import './jaslyn-brand.css';
import './console-polish.css';
import './overview.css';
import './auth.css';
import './legal/legal.css';
import './console-system-ui.css';
import './plan-catalogue.css';
import './dashboard/platform-subscription/platform-subscription.css';
import './landing.css';
import './marketing-pages.css';
import './premium.css';
import './enterprise-presence.css';
import './landing-premium.css';
import './loading.css';
import './settings/settings.css';
import './account/account.css';
import './notifications/notifications.css';
import './network/network.css';
import './access-network/access-network.css';
import './fiber/fiber.css';
import './isp/isp.css';
import './purchases/purchases.css';
import './sales/sales.css';
import './landing-world-class.css';
import ConsoleChrome from './console-chrome';

export const viewport: Viewport = { themeColor: '#101525', colorScheme: 'light' };

export const metadata: Metadata = {
  title: 'JASLYN NET — Wi-Fi Billing, Subscriber Access & ISP Operations',
  description: 'Manage Wi-Fi packages, subscriber access, payment workflows and ISP network operations in one workspace. Explore the JASLYN NET platform and integrations.',
  applicationName: 'JASLYN NET',
  robots: { index: true, follow: true },
  keywords: ['WiFi management', 'ISP billing', 'hotspot management', 'RADIUS', 'network operations', 'subscriber management', 'JASLYN NET'],
  openGraph: {
    title: 'JASLYN NET — Wi-Fi & ISP Operations Platform',
    description: 'A connected workspace for Wi-Fi billing, subscriber access and network operations teams.',
    siteName: 'JASLYN NET',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'JASLYN NET — Wi-Fi & ISP Operations Platform',
    description: 'Connect customer, billing, access and network operations in one control plane.',
  },
  icons: {
    icon: '/ram-logo-scalable.svg',
    apple: '/1000242339.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ConsoleChrome>{children}</ConsoleChrome></body></html>;
}
