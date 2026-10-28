import type { Metadata } from 'next';
import LandingPage from '../landing/landing-page';
import { COPY } from '../landing/copy';

export const metadata: Metadata = {
  title: COPY.sw.meta.title,
  description: COPY.sw.meta.description,
  alternates: { languages: { en: '/', sw: '/sw' } },
  openGraph: { title: COPY.sw.meta.title, description: COPY.sw.meta.description, siteName: 'JASLYN NET', type: 'website', locale: 'sw_TZ' },
};

export default function SwahiliHome() {
  return <LandingPage lang="sw" />;
}
