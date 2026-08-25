import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getSiteUrl } from "@/lib/site-url";
import { listSupervisors } from "@/lib/supervisors";

export const metadata: Metadata = {
  title: "San Francisco Supervisors: Profiles and Recorded Votes",
  description: "Browse San Francisco supervisor profiles and page-addressable evidence for recorded roll-call positions parsed from official Board of Supervisors minutes.",
  alternates: { canonical: "/supervisors" },
  openGraph: {
    type: "website",
    url: "/supervisors",
    title: "San Francisco Supervisors: Profiles and Recorded Votes",
    description: "Supervisor profiles and evidence for recorded roll-call positions from official San Francisco Board of Supervisors minutes.",
  },
};

export const revalidate = 3600;

export default async function SupervisorsPage() {
  const supervisors = await listSupervisors();
  const siteUrl = getSiteUrl();
  const indexedSupervisors = supervisors.filter((supervisor) => supervisor.recordedPositions > 0);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "San Francisco Supervisors: Profiles and Recorded Votes",
    description: metadata.description,
    url: `${siteUrl}/supervisors`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: indexedSupervisors.length,
      itemListElement: indexedSupervisors.map((supervisor, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: supervisor.displayName,
        url: `${siteUrl}/supervisors/${supervisor.slug}`,
      })),
    },
    isPartOf: { "@type": "WebSite", name: "SF BOS Search", url: siteUrl },
  };
  return (
    <div className="archive-shell">
      <SiteHeader />
      <main className="archive-main entity-index">
        <p className="docs-kicker">IDENTIFIER-RECONCILED RECORDS</p>
        <h1>Supervisors</h1>
        <p className="archive-lede">
          Recorded positions parsed from official minutes. Counts describe appearances in roll calls,
          not policy positions or support for the underlying legislation.
        </p>
        <ol className="entity-list">
          {supervisors.map((supervisor) => (
            <li key={supervisor.slug} className={supervisor.active ? "is-current" : undefined}>
              <div className="entity-name">
                <Link href={`/supervisors/${supervisor.slug}`}>{supervisor.displayName}</Link>
                {supervisor.active && <span className="current-badge">CURRENT</span>}
              </div>
              <span className="entity-district">District {supervisor.district ?? "unknown"}</span>
              <span>{supervisor.firstRecordedDate ?? "unknown"} to {supervisor.lastRecordedDate ?? "unknown"}</span>
              <strong>{supervisor.recordedPositions.toLocaleString()} recorded positions</strong>
            </li>
          ))}
        </ol>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
