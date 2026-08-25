import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getDocumentEvidence } from "@/lib/documents";
import { diffDocumentVersions, listDocumentVersions } from "@/lib/versions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> };
export const metadata: Metadata = { title: "Document versions", robots: { index: false, follow: true } };
export const revalidate = 3600;

export default async function VersionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const document = await getDocumentEvidence(id);
  if (!document) notFound();
  const versions = await listDocumentVersions(id);
  const query = await searchParams;
  const from = Number(query.from);
  const to = Number(query.to);
  const diff = Number.isInteger(from) && Number.isInteger(to) ? await diffDocumentVersions(id, from, to) : null;
  return (
    <div className="docs-shell">
      <SiteHeader />
      <main>
        <Link href={document.transcriptPath} className="docs-kicker">← DOCUMENT</Link>
        <p className="docs-kicker">IMMUTABLE TEXT SNAPSHOTS</p>
        <h1>Versions</h1>
        <p className="docs-lede">{document.title}. Page hashes and extracted text are retained so source changes can be inspected.</p>
        <section><h2>Captured versions</h2>
          <ol className="version-list">{versions.map((version, index) => (
            <li key={version.id}>
              <strong>Version {version.versionNumber}</strong><code>{version.contentSha256}</code>
              <span>{version.capturedAt} · {version.pageCount} pages · {version.parserVersion ?? "unknown parser"}</span>
              {versions[index + 1] && <Link href={`?from=${versions[index + 1].versionNumber}&to=${version.versionNumber}`}>COMPARE WITH PREVIOUS</Link>}
            </li>
          ))}</ol>
        </section>
        {diff && <section><h2>Version {diff.from.versionNumber} to {diff.to.versionNumber}</h2><p>{diff.changedPages} changed pages.</p>
          {diff.changes.map((change) => <article className="diff-page" key={change.pageNumber}><h3>Page {change.pageNumber}: {change.changeType}</h3>
            {change.lines.removed.length > 0 && <pre className="diff-removed">{change.lines.removed.map((line) => `- ${line}`).join("\n")}</pre>}
            {change.lines.added.length > 0 && <pre className="diff-added">{change.lines.added.map((line) => `+ ${line}`).join("\n")}</pre>}
          </article>)}
        </section>}
      </main>
    </div>
  );
}
