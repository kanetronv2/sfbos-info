import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteUrl } from "@/lib/site-url";
import { getSupervisor } from "@/lib/supervisors";

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getSupervisor((await params).slug);
  if (!profile) return { title: "Supervisor not found" };
  return {
    title: `${profile.displayName} recorded votes`,
    description: `Page-addressable evidence for recorded San Francisco Board of Supervisors roll-call positions attributed to ${profile.displayName}.`,
    alternates: { canonical: `/supervisors/${profile.slug}` },
  };
}

export default async function SupervisorPage({ params }: Props) {
  const profile = await getSupervisor((await params).slug);
  if (!profile) notFound();
  const siteUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${siteUrl}/supervisors/${profile.slug}`,
    mainEntity: { "@type": "Person", name: profile.displayName },
    description: "A data profile of recorded roll-call positions extracted from official public minutes.",
  };
  return (
    <div className="evidence-shell">
      <header className="topbar">
        <Link href="/" className="wordmark"><span className="prompt-mark">&gt;_</span> sfbos.info</Link>
        <nav><Link href="/supervisors">SUPERVISORS</Link><Link href="/documents">PDFS</Link><Link href="/api">API</Link></nav>
      </header>
      <main className="evidence-main supervisor-profile">
        <nav className="evidence-breadcrumb"><Link href="/supervisors">Supervisors</Link><span>/</span><span>{profile.displayName}</span></nav>
        <header className="evidence-header">
          <p className="docs-kicker">RECORDED ROLL-CALL EVIDENCE</p>
          <h1>{profile.displayName}</h1>
          <p className="evidence-notice">
            These are recorded positions on specific actions. A No is not automatically opposition to
            a project, and an Aye is not automatically support. Read the action and cited minutes.
          </p>
        </header>
        <section className="position-grid" aria-label="Recorded position counts">
          {Object.entries(profile.counts).map(([position, count]) => (
            <div key={position}><span>{position}</span><strong>{count.toLocaleString()}</strong></div>
          ))}
        </section>
        <section className="profile-provenance">
          <h2>Identity and provenance</h2>
          <dl>
            <dt>Aliases</dt><dd>{profile.aliases.map((alias) => alias.alias).join(", ")}</dd>
            <dt>Coverage</dt><dd>{profile.firstRecordedDate} to {profile.lastRecordedDate}</dd>
            <dt>Parser</dt><dd>{profile.parserVersions.join(", ") || "Pending provenance backfill"}</dd>
          </dl>
        </section>
        <section className="structured-records">
          <div className="section-heading"><div><p className="docs-kicker">MOST RECENT 250</p><h2>Recorded positions</h2></div><span>{profile.recordedPositions} total</span></div>
          <ol className="vote-evidence-list">
            {profile.votes.map((vote) => (
              <li key={vote.id}>
                <div className="vote-evidence-meta"><time>{vote.meetingDate}</time><strong>{vote.position}</strong><span>{Math.round(vote.confidence * 100)}% extraction confidence</span></div>
                <h3>File {vote.fileNumber}: {vote.title}</h3>
                <p>{vote.action || "Action text unavailable."}</p>
                <div><a href={vote.transcriptUrl}>HTML EVIDENCE</a><a href={vote.markdownUrl}>MARKDOWN</a><a href={vote.officialUrl} target="_blank" rel="noreferrer">OFFICIAL PDF</a></div>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    </div>
  );
}
