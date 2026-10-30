import Link from 'next/link';
import { legalDocuments } from './legal-documents';

export const metadata = {
  title: 'Legal Center | JASLYN NET',
  description: 'Terms, privacy, security, billing and other legal documents for JASLYN NET.',
};

export default function LegalIndexPage() {
  return <main className="legal-shell">
    <header className="legal-hero">
      <Link href="/login" className="legal-brand"><img src="/brand/jaslyn-net-icon.svg" alt="" /><span>JASLYN NET</span></Link>
      <div className="legal-hero-copy">
        <span className="legal-kicker">LEGAL CENTER</span>
        <h1>Policies that govern the platform.</h1>
        <p>Operational legal documents for customers, administrators, subscribers and organizations using JASLYN NET.</p>
        <small>Effective date: {legalDocuments[0].effectiveDate}</small>
      </div>
    </header>
    <section className="legal-grid" aria-label="Legal documents">
      {legalDocuments.map((document) => <Link key={document.slug} href={`/legal/${document.slug}`} className="legal-card">
        <span>JASLYN NET / LEGAL</span>
        <h2>{document.shortTitle}</h2>
        <p>{document.summary}</p>
        <b>Read document <i>→</i></b>
      </Link>)}
    </section>
    <footer className="legal-footer"><span>© {new Date().getFullYear()} YURIAN TECH LTD. All rights reserved.</span><Link href="/login">Return to JASLYN NET</Link></footer>
  </main>;
}
