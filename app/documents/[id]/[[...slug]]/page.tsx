import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { documentSlug, documentUrl } from "@/lib/document-url";
import { getDocumentEvidence } from "@/lib/documents";

type EvidencePageProps = {
  params: Promise<{ id: string; slug?: string[] }>;
};

export const revalidate = 3600;

export async function generateMetadata({ params }: EvidencePageProps): Promise<Metadata> {
  const { id } = await params;
  const document = await getDocumentEvidence(id);
  if (!document) return { title: "Document not found" };
  return {
    title: document.title,
    description: `Extracted text for the ${document.meetingDate} Board of Supervisors ${document.kind}, with a link to the official PDF.`,
    alternates: { canonical: document.transcriptPath },
    openGraph: {
      type: "article",
      title: document.title,
      description: `Page-by-page extracted text and official source for this Board of Supervisors ${document.kind}.`,
      url: document.transcriptPath,
    },
  };
}

export default async function DocumentEvidencePage({ params }: EvidencePageProps) {
  const { id, slug } = await params;
  const document = await getDocumentEvidence(id);
  if (!document) notFound();

  const expectedSlug = documentSlug(document.meetingDate, document.kind);
  if (slug?.length !== 1 || slug[0] !== expectedSlug) permanentRedirect(document.transcriptPath);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: documentUrl(document.id, document.meetingDate, document.kind),
    mainEntity: {
      "@type": "DigitalDocument",
      name: document.title,
      datePublished: document.meetingDate,
      encodingFormat: "application/pdf",
      url: document.officialUrl,
      publisher: {
        "@type": "GovernmentOrganization",
        name: "City and County of San Francisco",
      },
    },
  };

  return (
    <div className="evidence-shell">
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="SF BOS Search home">
          <span className="prompt-mark" aria-hidden="true">&gt;_</span>
          <span>sfbos.info</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">SEARCH</Link>
          <Link href="/documents">PDFS</Link>
          <Link href="/api">API</Link>
          <a href="/llms.txt">FOR MODELS</a>
        </nav>
      </header>

      <main className="evidence-main">
        <nav className="evidence-breadcrumb" aria-label="Breadcrumb">
          <Link href="/documents">PDF archive</Link>
          <span>/</span>
          <Link href={`/documents#${document.year}`}>{document.year}</Link>
          <span>/</span>
          <span>{document.kind}</span>
        </nav>

        <header className="evidence-header">
          <div className="evidence-labels">
            <span className={`document-kind ${document.kind}`}>{document.kind}</span>
            <time dateTime={document.meetingDate}>{formatDate(document.meetingDate)}</time>
            <span>{document.pageCount} pages</span>
          </div>
          <h1>{document.title}</h1>
          <div className="evidence-actions">
            <a className="source-button" href={document.officialUrl} target="_blank" rel="noreferrer">
              VIEW OFFICIAL PDF ↗
            </a>
            <a href="#extracted-text">JUMP TO EXTRACTED TEXT ↓</a>
          </div>
          <p className="evidence-notice">
            This is a page-by-page text extraction provided for search and accessibility. Extraction
            errors may be present. The linked official PDF is the authoritative public record.
          </p>
        </header>

        {document.items.length > 0 && (
          <section className="structured-records" aria-labelledby="structured-records-title">
            <div className="section-heading">
              <div>
                <p className="docs-kicker">PARSED FROM THE OFFICIAL MINUTES</p>
                <h2 id="structured-records-title">Structured legislative records</h2>
              </div>
              <span>{document.items.length} files</span>
            </div>
            <div className="structured-item-list">
              {document.items.map((item) => (
                <details key={item.id} id={`file-${item.fileNumber}`} className="structured-item">
                  <summary>
                    <span>FILE {item.fileNumber}</span>
                    <strong>{item.title}</strong>
                    <a href={`#page-${item.startPage}`}>
                      {pageRange(item.startPage, item.endPage)}
                    </a>
                  </summary>
                  {item.rollCalls.length ? (
                    <div className="structured-votes">
                      {item.rollCalls.map((rollCall) => (
                        <article key={rollCall.sequence}>
                          <div>
                            <span>{rollCall.actionType}</span>
                            {rollCall.isFinal && <strong>LIKELY FINAL</strong>}
                          </div>
                          <p>{rollCall.action || "Action text unavailable."}</p>
                          <VoteLine label="Ayes" names={rollCall.ayes} />
                          <VoteLine label="Noes" names={rollCall.noes} />
                          <VoteLine label="Absent" names={rollCall.absent} />
                          <VoteLine label="Excused" names={rollCall.excused} />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="no-recorded-vote">No recorded roll call was parsed for this item.</p>
                  )}
                </details>
              ))}
            </div>
          </section>
        )}

        <section id="extracted-text" className="extracted-text" aria-labelledby="extracted-text-title">
          <div className="section-heading">
            <div>
              <p className="docs-kicker">HTML TEXT VIEW</p>
              <h2 id="extracted-text-title">Extracted text</h2>
            </div>
            <span>{document.pages.length} pages</span>
          </div>

          <nav className="page-navigation" aria-label="Document pages">
            {document.pages.map((page) => (
              <a key={page.pageNumber} href={`#page-${page.pageNumber}`}>{page.pageNumber}</a>
            ))}
          </nav>

          <article className="document-pages">
            {document.pages.map((page) => (
              <section key={page.pageNumber} id={`page-${page.pageNumber}`} className="document-page">
                <header>
                  <h3>Page {page.pageNumber}</h3>
                  <div>
                    <a href={`#page-${page.pageNumber}`} aria-label={`Link to page ${page.pageNumber}`}>#</a>
                    <a href={document.officialUrl} target="_blank" rel="noreferrer">PDF ↗</a>
                  </div>
                </header>
                <div className="page-text">{page.content}</div>
              </section>
            ))}
          </article>
        </section>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}

function VoteLine({ label, names }: { label: string; names: string[] }) {
  if (!names.length) return null;
  return <p className="vote-line"><strong>{label}:</strong> {names.join(", ")}</p>;
}

function pageRange(start: number, end: number) {
  return start === end ? `PAGE ${start}` : `PAGES ${start}-${end}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
