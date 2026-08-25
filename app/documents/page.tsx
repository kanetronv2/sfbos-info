import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { listDocuments } from "@/lib/documents";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "San Francisco Board of Supervisors Document Archive",
  description: "Browse and search available San Francisco Board of Supervisors agendas and meeting minutes from 1996 onward, with HTML transcripts and official City sources.",
  alternates: { canonical: "/documents" },
  openGraph: {
    type: "website",
    url: "/documents",
    title: "San Francisco Board of Supervisors Document Archive",
    description: "Searchable agendas and meeting minutes, HTML transcripts, and official City source documents from 1996 onward.",
  },
};

export default async function DocumentsPage() {
  const documents = await listDocuments();
  const years = new Map<number, typeof documents>();
  for (const document of documents) {
    const yearDocuments = years.get(document.year) ?? [];
    yearDocuments.push(document);
    years.set(document.year, yearDocuments);
  }
  const agendaCount = documents.filter((document) => document.kind === "agenda").length;
  const minutesCount = documents.length - agendaCount;
  const siteUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "San Francisco Board of Supervisors Document Archive",
    description: metadata.description,
    url: `${siteUrl}/documents`,
    mainEntity: {
      "@type": "ItemList",
      name: "Board of Supervisors agendas and minutes",
      numberOfItems: documents.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
    },
    isPartOf: {
      "@type": "WebSite",
      name: "SF BOS Search",
      url: siteUrl,
    },
  };

  return (
    <div className="archive-shell">
      <SiteHeader />

      <main className="archive-main">
        <p className="docs-kicker">OFFICIAL SOURCE LINKS · PUBLIC CATALOG</p>
        <h1>Document archive.</h1>
        <p className="archive-lede">
          The official agenda and minutes catalog, ordered newest first. Records from 2010 onward
          are generally PDFs; much of the older City archive was published as HTML. All retrievable
          records have searchable text views. The legacy City catalog has missing or malformed
          listings for 2003 through 2005, does not publish every document type in some earlier
          years, and serves two truncated agenda PDFs from 1998.
        </p>

        <div className="archive-stats" aria-label="Archive statistics">
          <span><strong>{documents.length.toLocaleString()}</strong> documents</span>
          <span><strong>{agendaCount.toLocaleString()}</strong> agendas</span>
          <span><strong>{minutesCount.toLocaleString()}</strong> minutes</span>
          <span><strong>{years.size}</strong> years</span>
        </div>

        {!documents.length ? (
          <div className="archive-empty">
            The archive requires a configured database connection.
          </div>
        ) : (
          <div className="archive-years">
            {[...years.entries()].map(([year, yearDocuments]) => (
              <section key={year} id={String(year)} className="archive-year">
                <header>
                  <h2>{year}</h2>
                  <span>{yearDocuments.length} documents</span>
                </header>
                <ol>
                  {yearDocuments.map((document) => (
                    <li key={document.id}>
                      <time dateTime={document.meetingDate}>{formatDate(document.meetingDate)}</time>
                      <span className={`document-kind ${document.kind}`}>{document.kind}</span>
                      <Link href={document.transcriptPath}>
                        {document.title}
                      </Link>
                      <span className="page-count">{document.pageCount ? `${document.pageCount} pp.` : "CATALOG"}</span>
                      <a className="archive-source-link" href={document.officialUrl} target="_blank" rel="noreferrer">
                        {document.sourceFormat.toUpperCase()} ↗
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
