import Link from 'next/link';
import SiteShell from '../landing/site-chrome';
import { legalDocuments } from './legal-documents';

export const metadata = {
  title: 'Legal Center | JASLYN NET',
  description: 'Terms, privacy, security, billing and other legal documents for JASLYN NET.',
};

export default function LegalIndexPage() {
  return (
    <SiteShell>
      <section className="jl-pagehead" aria-labelledby="jl-legal-h1">
        <div className="jl-wrap">
          <h1 id="jl-legal-h1">Policies that govern the platform.</h1>
          <p className="jl-lead">Operational legal documents for customers, administrators, subscribers and organizations using JASLYN NET.</p>
          <p className="jl-meta">Effective date: {legalDocuments[0].effectiveDate}</p>
        </div>
      </section>
      <section className="jl-pagerows" aria-label="Legal documents">
        <div className="jl-wrap">
          {legalDocuments.map((document) => (
            <Link key={document.slug} href={`/legal/${document.slug}`} className="jl-doclink">
              <div><h2 className="jl-h3x">{document.shortTitle}</h2><p>{document.summary}</p></div>
              <span className="jl-doclink-cta">Read document</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="jl-pagenext">
        <div className="jl-wrap jl-pagenext-in">
          <small className="jl-meta">© {new Date().getFullYear()} YURIAN TECH LTD. All rights reserved.</small>
          <Link href="/" className="jl-textlink">Back to home</Link>
        </div>
      </section>
    </SiteShell>
  );
}
