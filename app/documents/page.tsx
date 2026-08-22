import type { Metadata } from "next";
import Link from "next/link";
import { listDocuments } from "@/lib/documents";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "PDF archive",
  description: "Every indexed San Francisco Board of Supervisors agenda and minutes PDF, linked to its official City source.",
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

  return (
    <div className="archive-shell">
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="SF BOS Search home">
          <span className="prompt-mark" aria-hidden="true">&gt;_</span>
          <span>sfbos.info</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">SEARCH</Link>
          <Link href="/api">API</Link>
          <a href="/llms.txt">FOR MODELS</a>
          <a href="/openapi.yaml">SCHEMA</a>
        </nav>
      </header>

      <main className="archive-main">
        <p className="docs-kicker">OFFICIAL SOURCE LINKS · COMPLETE INDEX</p>
        <h1>PDF archive.</h1>
        <p className="archive-lede">
          Every agenda and minutes PDF in the index, ordered newest first. Each HTML text view links
          back to the authoritative San Francisco government document.
        </p>

        <div className="archive-stats" aria-label="Archive statistics">
          <span><strong>{documents.length.toLocaleString()}</strong> PDFs</span>
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
                  <span>{yearDocuments.length} PDFs</span>
                </header>
                <ol>
                  {yearDocuments.map((document) => (
                    <li key={document.id}>
                      <time dateTime={document.meetingDate}>{formatDate(document.meetingDate)}</time>
                      <span className={`document-kind ${document.kind}`}>{document.kind}</span>
                      <Link href={document.transcriptPath}>
                        {document.title}
                      </Link>
                      <span className="page-count">{document.pageCount || "N/A"} pp.</span>
                      <a className="archive-source-link" href={document.officialUrl} target="_blank" rel="noreferrer">
                        PDF ↗
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </main>
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
