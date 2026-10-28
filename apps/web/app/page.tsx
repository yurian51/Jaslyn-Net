import type { Metadata } from 'next';
import LandingPage from './landing/landing-page';
import { COPY } from './landing/copy';

export const metadata: Metadata = {
  title: COPY.en.meta.title,
  description: COPY.en.meta.description,
  alternates: { languages: { en: '/', sw: '/sw' } },
};

export default function Home() {
  return <LandingPage lang="en" />;
}
