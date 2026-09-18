import Link from 'next/link';
import { notFound } from 'next/navigation';
import { legalDocumentMap, legalDocuments } from '../legal-documents';

export function generateStaticParams() {
  return legalDocuments.map((document) => ({ slug: document.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = legalDocumentMap.get(slug);
  if (!document) return { title: 'Legal document | JASLYN NET' };
  return { title: `${document.shortTitle} | JASLYN NET`, description: document.summary };
}

export default async function LegalDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = legalDocumentMap.get(slug);
  if (!document) notFound();

  return <main className="legal-shell legal-document-shell">
    <header className="legal-document-top">
      <Link href="/legal" className="legal-brand"><img src="/brand/jaslyn-net-icon.svg" alt="" /><span>JASLYN NET</span></Link>
      <Link href="/legal" className="legal-back">← Legal Center</Link>
    </header>
    <article className="legal-document">
      <div className="legal-document-heading">
        <span className="legal-kicker">JASLYN NET / LEGAL</span>
        <h1>{document.title}</h1>
        <p>{document.summary}</p>
        <div className="legal-meta"><span>Effective: {document.effectiveDate}</span><span>Owner: YURIAN TECH LTD</span></div>
      </div>
      <aside className="legal-notice"><strong>Important</strong><span>This document is part of the JASLYN NET service terms. It is written for operational use and should be read with any signed order, applicable service-specific agreement and mandatory law.</span></aside>
      <div className="legal-content">
        {document.sections.map((section) => <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
        </section>)}
      </div>
      <div className="legal-document-footer">
        <span>YURIAN TECH LTD · JASLYN NET</span>
        <Link href="/legal">All legal documents</Link>
      </div>
    </article>
  </main>;
}
