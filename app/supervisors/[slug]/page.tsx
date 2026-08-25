import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteUrl } from "@/lib/site-url";
import { getDistrictNeighborhoods } from "@/lib/supervisor-districts";
import { getSupervisor } from "@/lib/supervisors";

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getSupervisor((await params).slug);
  if (!profile) return { title: "Supervisor not found" };
  return {
    title: `${profile.displayName} supervisor profile and recorded votes`,
    description: `${profile.active ? "Current office contact information and " : "Identity information and "}page-addressable evidence for recorded San Francisco Board of Supervisors roll-call positions attributed to ${profile.displayName}.`,
    alternates: { canonical: `/supervisors/${profile.slug}` },
  };
}

export default async function SupervisorPage({ params }: Props) {
  const profile = await getSupervisor((await params).slug);
  if (!profile) notFound();
  const siteUrl = getSiteUrl();
  const neighborhoods = getDistrictNeighborhoods(profile.district);
  const person = {
    "@type": "Person",
    name: profile.displayName,
    ...(profile.active ? { jobTitle: `District ${profile.district} Supervisor` } : {}),
    ...(profile.contact ? {
      email: profile.contact.email,
      telephone: profile.contact.phone,
      url: profile.contact.officialUrl,
      address: {
        "@type": "PostalAddress",
        streetAddress: profile.contact.address,
        addressLocality: "San Francisco",
        addressRegion: "CA",
      },
    } : {}),
  };
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${siteUrl}/supervisors/${profile.slug}`,
    mainEntity: person,
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
          <p className="docs-kicker">SUPERVISOR PROFILE AND RECORDED ROLL-CALL EVIDENCE</p>
          <h1>{profile.displayName}</h1>
          <p className="evidence-notice">
            These are recorded positions on specific actions. A No is not automatically opposition to
            a project, and an Aye is not automatically support. Read the action and cited minutes.
          </p>
        </header>
        <section className="profile-contact" aria-labelledby="contact-title">
          <div>
            <p className="docs-kicker">{profile.active ? "CURRENT CITY OFFICE" : "FORMER SUPERVISOR"}</p>
            <h2 id="contact-title">Contact</h2>
          </div>
          {profile.contact ? (
            <dl>
              <dt>District</dt>
              <dd>
                {profile.district}
                {neighborhoods.length > 0 ? ` (${neighborhoods.join(", ")})` : ""}
              </dd>
              <dt>Email</dt><dd><a href={`mailto:${profile.contact.email}`}>{profile.contact.email}</a></dd>
              <dt>Phone</dt><dd><a href={`tel:${profile.contact.phone.replace(/[^+\d]/g, "")}`}>{profile.contact.phone}</a></dd>
              <dt>Office</dt><dd>{profile.contact.address}<br />San Francisco, CA 94102</dd>
              <dt>Official page</dt><dd><a href={profile.contact.officialUrl} target="_blank" rel="noreferrer">Board of Supervisors profile ↗</a></dd>
              <dt>Verified source</dt><dd><a href={profile.contact.sourceUrl} target="_blank" rel="noreferrer">Official current roster ↗</a></dd>
            </dl>
          ) : (
            <p>
              {profile.displayName} is not a sitting supervisor, so no current Board office contact is listed.
              {" "}<a href="https://sfbos.org/former-supervisors" target="_blank" rel="noreferrer">Official former supervisors directory ↗</a>
            </p>
          )}
        </section>
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
