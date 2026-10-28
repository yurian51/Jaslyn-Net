import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteShell from '../../landing/site-chrome';
import { legalDocumentMap, legalDocuments } from '../legal-documents';
import LegalAcceptance from '../legal-acceptance';

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

  return (
    <SiteShell>
      <article className="jl-doc">
        <div className="jl-wrap jl-doc-in">
          <Link href="/legal" className="jl-textlink jl-doc-back">All legal documents</Link>
          <h1>{document.title}</h1>
          <p className="jl-lead">{document.summary}</p>
          <p className="jl-meta">Effective {document.effectiveDate}. Owner: YURIAN TECH LTD.</p>
          <p className="jl-caveat"><strong>Important. </strong>This document is part of the JASLYN NET service terms. It is written for operational use and should be read with any signed order, applicable service-specific agreement and mandatory law.</p>
          {(document.slug === 'terms' || document.slug === 'privacy') && <LegalAcceptance documentType={document.slug === 'terms' ? 'TERMS_OF_USE' : 'PRIVACY_NOTICE'} documentVersion="2026-09-18" />}
          <div className="jl-doc-body">
            {document.sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                {section.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
              </section>
            ))}
          </div>
          <p className="jl-meta jl-doc-foot">YURIAN TECH LTD · JASLYN NET</p>
        </div>
      </article>
    </SiteShell>
  );
}
