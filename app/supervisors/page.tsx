import type { Metadata } from "next";
import Link from "next/link";
import { listSupervisors } from "@/lib/supervisors";

export const metadata: Metadata = {
  title: "Supervisors",
  description: "Recorded roll-call evidence by San Francisco supervisor, reconciled from official Board minutes.",
  alternates: { canonical: "/supervisors" },
};

export const revalidate = 3600;

export default async function SupervisorsPage() {
  const supervisors = await listSupervisors();
  return (
    <div className="archive-shell">
      <header className="topbar">
        <Link href="/" className="wordmark"><span className="prompt-mark">&gt;_</span> sfbos.info</Link>
        <nav><Link href="/">SEARCH</Link><Link href="/documents">PDFS</Link><Link href="/api">API</Link></nav>
      </header>
      <main className="archive-main entity-index">
        <p className="docs-kicker">IDENTIFIER-RECONCILED RECORDS</p>
        <h1>Supervisors</h1>
        <p className="archive-lede">
          Recorded positions parsed from official minutes. Counts describe appearances in roll calls,
          not policy positions or support for the underlying legislation.
        </p>
        <ol className="entity-list">
          {supervisors.filter((supervisor) => supervisor.recordedPositions > 0).map((supervisor) => (
            <li key={supervisor.slug}>
              <Link href={`/supervisors/${supervisor.slug}`}>{supervisor.displayName}</Link>
              <span>{supervisor.firstRecordedDate ?? "unknown"} to {supervisor.lastRecordedDate ?? "unknown"}</span>
              <strong>{supervisor.recordedPositions.toLocaleString()} recorded positions</strong>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
