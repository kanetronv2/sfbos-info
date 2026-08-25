import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { documentMarkdownPath, documentSlug, documentUrl } from "@/lib/document-url";
import { getDocumentEvidence } from "@/lib/documents";
import { listSupervisorNameLinks } from "@/lib/supervisors";
import { SiteHeader } from "@/components/site-header";
import { TargetDetails } from "@/components/target-details";
import { SupervisorLinkedText } from "@/components/supervisor-linked-text";

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
    description: `${document.pageCount ? "Extracted text and " : "Catalog record with an "}official source link for the ${document.meetingDate} Board of Supervisors ${document.kind}.`,
    alternates: {
      canonical: document.transcriptPath,
      ...(document.pageCount ? { types: { "text/markdown": documentMarkdownPath(document.id, document.meetingDate, document.kind) } } : {}),
    },
    openGraph: {
      type: "article",
      title: document.title,
      description: `${document.pageCount ? "Page-by-page extracted text and " : "Catalog record with an "}official source for this Board of Supervisors ${document.kind}.`,
      url: document.transcriptPath,
      publishedTime: `${document.meetingDate}T00:00:00Z`,
    },
  };
}

export default async function DocumentEvidencePage({ params }: EvidencePageProps) {
  const { id, slug } = await params;
  const [document, supervisorLinks] = await Promise.all([
    getDocumentEvidence(id),
    listSupervisorNameLinks(),
  ]);
  if (!document) notFound();

  const expectedSlug = documentSlug(document.meetingDate, document.kind);
  if (slug?.length !== 1 || slug[0] !== expectedSlug) permanentRedirect(document.transcriptPath);

  const documentPageUrl = documentUrl(document.id, document.meetingDate, document.kind);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: document.title,
      description: `${document.pageCount ? "Page-by-page extracted text" : "Official source catalog record"} for the ${document.meetingDate} San Francisco Board of Supervisors ${document.kind}.`,
      url: documentPageUrl,
      datePublished: document.meetingDate,
      isPartOf: {
        "@type": "CollectionPage",
        name: "San Francisco Board of Supervisors Document Archive",
        url: `${documentPageUrl.split("/documents/")[0]}/documents`,
      },
      mainEntity: {
        "@type": "DigitalDocument",
        name: document.title,
        datePublished: document.meetingDate,
        encodingFormat: document.sourceFormat === "pdf" ? "application/pdf" : "text/html",
        url: document.officialUrl,
        publisher: {
          "@type": "GovernmentOrganization",
          name: "City and County of San Francisco",
        },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Document archive",
          item: `${documentPageUrl.split("/documents/")[0]}/documents`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: String(document.year),
          item: `${documentPageUrl.split("/documents/")[0]}/documents#${document.year}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: document.title,
          item: documentPageUrl,
        },
      ],
    },
  ];

  return (
    <div className="evidence-shell">
      <TargetDetails />
      <SiteHeader />

      <main className="evidence-main">
        <nav className="evidence-breadcrumb" aria-label="Breadcrumb">
          <Link href="/documents">Document archive</Link>
          <span>/</span>
          <Link href={`/documents#${document.year}`}>{document.year}</Link>
          <span>/</span>
          <span>{document.kind}</span>
        </nav>

        <header className="evidence-header">
          <div className="evidence-labels">
            <span className={`document-kind ${document.kind}`}>{document.kind}</span>
            <time dateTime={document.meetingDate}>{formatDate(document.meetingDate)}</time>
            <span>{document.pageCount ? `${document.pageCount} pages` : "catalog record"}</span>
          </div>
          <h1>{document.title}</h1>
          <div className="evidence-actions">
            <a className="source-button" href={document.officialUrl} target="_blank" rel="noreferrer">
              VIEW OFFICIAL {document.sourceFormat.toUpperCase()} ↗
            </a>
            {document.pageCount ? <>
              <a href={documentMarkdownPath(document.id, document.meetingDate, document.kind)}>VIEW AS MARKDOWN ↗</a>
              <Link href={`/documents/${document.id}/versions`}>VERSIONS / DIFF ↗</Link>
              <a href="#extracted-text">JUMP TO EXTRACTED TEXT ↓</a>
            </> : null}
          </div>
          <p className="evidence-notice">
            {document.pageCount
              ? `This is a page-by-page text extraction provided for search and accessibility. Extraction errors may be present. The linked official ${document.sourceFormat.toUpperCase()} is the authoritative public record.`
              : `This pre-2012 record is cataloged from the City's legacy archive. A local transcript has not yet been extracted. Follow the official ${document.sourceFormat.toUpperCase()} link for the authoritative public record.`}
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
                    <div className="structured-item-meta">
                      <span>FILE {item.fileNumber}</span>
                      <a
                        href={officialSourcePage(document.officialUrl, item.startPage)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${pageRange(item.startPage, item.endPage)} in the official PDF`}
                      >
                        SOURCE {pageRange(item.startPage, item.endPage)} ↗
                      </a>
                    </div>
                    <strong>
                      <a
                        className="structured-source-link"
                        href={officialSourcePage(document.officialUrl, item.startPage)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.title} <span aria-hidden="true">↗</span>
                      </a>
                    </strong>
                  </summary>
                  <p className="structured-provenance">
                    Extraction confidence: {item.extractionConfidence === null ? "not scored" : `${Math.round(item.extractionConfidence * 100)}%`}
                    {item.parserVersion ? ` · parser ${item.parserVersion}` : ""}
                  </p>
                  {item.rollCalls.length ? (
                    <div className="structured-votes">
                      {item.rollCalls.map((rollCall) => (
                        <article key={rollCall.sequence}>
                          <div>
                            <span>{rollCall.actionType}</span>
                            {rollCall.isFinal && <strong>LIKELY FINAL</strong>}
                          </div>
                          <p>{rollCall.action || "Action text unavailable."}</p>
                          <VoteLine label="Ayes" names={rollCall.ayes} supervisors={supervisorLinks} showWhenEmpty />
                          <VoteLine label="Noes" names={rollCall.noes} supervisors={supervisorLinks} showWhenEmpty />
                          <VoteLine label="Absent" names={rollCall.absent} supervisors={supervisorLinks} />
                          <VoteLine label="Excused" names={rollCall.excused} supervisors={supervisorLinks} />
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

        {document.pageCount ? <section id="extracted-text" className="extracted-text" aria-labelledby="extracted-text-title">
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
                    <a href={document.officialUrl} target="_blank" rel="noreferrer">{document.sourceFormat.toUpperCase()} ↗</a>
                  </div>
                </header>
                <div className="page-text">
                  <SupervisorLinkedText text={page.content} supervisors={supervisorLinks} />
                </div>
              </section>
            ))}
          </article>
        </section> : null}
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}

function VoteLine({
  label,
  names,
  supervisors,
  showWhenEmpty = false,
}: {
  label: string;
  names: string[];
  supervisors: Awaited<ReturnType<typeof listSupervisorNameLinks>>;
  showWhenEmpty?: boolean;
}) {
  if (!names.length && !showWhenEmpty) return null;
  return (
    <p className="vote-line">
      <strong>{label}:</strong>{" "}
      {names.length > 0
        ? <SupervisorLinkedText text={names.join(", ")} supervisors={supervisors} />
        : "None"}
    </p>
  );
}

function pageRange(start: number, end: number) {
  return start === end ? `PAGE ${start}` : `PAGES ${start}-${end}`;
}

function officialSourcePage(officialUrl: string, page: number) {
  const url = new URL(officialUrl);
  url.hash = `page=${page}`;
  return url.href;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
