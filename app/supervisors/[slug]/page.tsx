import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VoteLine } from "@/components/vote-line";
import { getSiteUrl } from "@/lib/site-url";
import { getDistrictNeighborhoods } from "@/lib/supervisor-districts";
import { currentSupervisorSalary } from "@/lib/supervisor-official-data";
import { getSupervisor, listSupervisorNameLinks, type SupervisorPosition } from "@/lib/supervisors";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ position?: string }>;
};
const positions: SupervisorPosition[] = ["aye", "no", "absent", "excused"];
const positionFilters = ["total", ...positions] as const;
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getSupervisor((await params).slug);
  if (!profile) return { title: "Supervisor not found" };
  const title = `${profile.displayName}: San Francisco Supervisor Profile and Recorded Votes`;
  const description = `${profile.active ? "Current office contact information and " : "Identity information and "}page-addressable evidence for recorded San Francisco Board of Supervisors roll-call positions attributed to ${profile.displayName}.`;
  return {
    title,
    description,
    alternates: { canonical: `/supervisors/${profile.slug}` },
    openGraph: {
      type: "profile",
      url: `/supervisors/${profile.slug}`,
      title,
      description,
      firstName: profile.displayName.split(" ")[0],
      lastName: profile.displayName.split(" ").slice(1).join(" "),
    },
  };
}

export default async function SupervisorPage({ params, searchParams }: Props) {
  const requestedPosition = (await searchParams).position;
  const position = positions.includes(requestedPosition as SupervisorPosition)
    ? requestedPosition as SupervisorPosition
    : undefined;
  const slug = (await params).slug;
  const [profile, supervisorLinks] = await Promise.all([
    getSupervisor(slug, position),
    listSupervisorNameLinks(),
  ]);
  if (!profile) notFound();
  const siteUrl = getSiteUrl();
  const neighborhoods = getDistrictNeighborhoods(profile.district);
  const person = {
    "@type": "Person",
    name: profile.displayName,
    ...(profile.officialUrl ? { sameAs: profile.officialUrl } : {}),
    ...(profile.active ? { jobTitle: `District ${profile.district} Supervisor` } : {}),
    ...(profile.contact ? {
      email: profile.contact.email,
      telephone: profile.contact.phone,
      url: profile.contact.officialUrl,
      ...(profile.contact.portraitUrl ? { image: profile.contact.portraitUrl } : {}),
      address: {
        "@type": "PostalAddress",
        streetAddress: profile.contact.address,
        addressLocality: "San Francisco",
        addressRegion: "CA",
      },
    } : {}),
  };
  const profileUrl = `${siteUrl}/supervisors/${profile.slug}`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: `${profile.displayName}: San Francisco Supervisor Profile and Recorded Votes`,
      url: profileUrl,
      mainEntity: person,
      description: "A data profile of recorded roll-call positions extracted from official public minutes.",
      isPartOf: { "@type": "CollectionPage", name: "San Francisco Supervisors", url: `${siteUrl}/supervisors` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Supervisors", item: `${siteUrl}/supervisors` },
        { "@type": "ListItem", position: 2, name: profile.displayName, item: profileUrl },
      ],
    },
  ];
  return (
    <div className="evidence-shell">
      <SiteHeader />
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
          <div className="profile-identity">
            {profile.contact?.portraitUrl && (
              <a href={profile.contact.officialUrl} target="_blank" rel="noreferrer" className="profile-portrait-link">
                <Image
                  src={profile.contact.portraitUrl}
                  alt={`Official portrait of ${profile.displayName}`}
                  width={345}
                  height={345}
                  className="profile-portrait"
                  priority
                />
              </a>
            )}
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
              <dt>Base salary</dt>
              <dd>
                <strong>${currentSupervisorSalary.annualBaseSalary.toLocaleString()} per year</strong><br />
                <span>FY {currentSupervisorSalary.fiscalYear} · effective {currentSupervisorSalary.effectiveDate}</span><br />
                <a href={currentSupervisorSalary.sourceUrl} target="_blank" rel="noreferrer">Civil Service Commission report ↗</a>
              </dd>
              <dt>Official page</dt><dd><a href={profile.contact.officialUrl} target="_blank" rel="noreferrer">Board of Supervisors profile ↗</a></dd>
            </dl>
          ) : (
            <dl>
              <dt>District</dt><dd>{profile.district === "At-large" ? "At-large" : profile.district ?? "Not available"}</dd>
              <dt>Service</dt><dd>{formatService(profile.termStart, profile.termEnd)}</dd>
              <dt>Official record</dt>
              <dd>
                <a href={profile.officialUrl ?? "https://sfbos.org/former-supervisors"} target="_blank" rel="noreferrer">
                  {profile.officialUrl ? "Board profile or historical entry ↗" : "Former supervisors directory ↗"}
                </a>
              </dd>
            </dl>
          )}
        </section>
        <section className="position-grid" aria-label="Filter recorded positions">
          {positionFilters.map((filterPosition) => {
            const isTotal = filterPosition === "total";
            const isSelected = isTotal ? !position : position === filterPosition;
            const count = isTotal ? profile.recordedPositions : profile.counts[filterPosition];
            return (
              <Link
                key={filterPosition}
                href={isTotal
                  ? `/supervisors/${profile.slug}`
                  : `/supervisors/${profile.slug}?position=${filterPosition}`}
                scroll={false}
                className={`${isTotal ? "position-total " : ""}position-${filterPosition}${isSelected ? " is-selected" : ""}`}
                aria-current={isSelected ? "true" : undefined}
                aria-label={`${isSelected ? "Currently showing" : "Show"} ${filterPosition}: ${count.toLocaleString()} recorded positions`}
              >
                <span>{filterPosition}</span>
                <strong>{count.toLocaleString()}</strong>
                <small>{isSelected ? "FILTERING" : "FILTER"}</small>
              </Link>
            );
          })}
        </section>
        <section className="structured-records" id="recorded-positions">
          <div className="section-heading">
            <div>
              <p className="docs-kicker">MOST RECENT 250{position ? ` · ${position.toUpperCase()}` : ""}</p>
              <h2>{position ? `${position.toUpperCase()} positions` : "Recorded positions"}</h2>
            </div>
            <span>{position ? `${profile.counts[position].toLocaleString()} matching` : `${profile.recordedPositions.toLocaleString()} total`}</span>
          </div>
          <ol className="vote-evidence-list">
            {profile.votes.map((vote) => (
              <li key={vote.id}>
                <div className="vote-evidence-meta">
                  <time>{vote.meetingDate}</time>
                  <strong
                    className={`vote-status vote-status-${vote.position.toLowerCase()}`}
                    aria-label={`Recorded position: ${vote.position}`}
                  >
                    {vote.position}
                  </strong>
                  <span>{Math.round(vote.confidence * 100)}% extraction confidence</span>
                </div>
                <h3>File {vote.fileNumber}: {vote.title}</h3>
                {vote.summary && (
                  <p className="vote-llm-summary">
                    <span title={vote.summaryModel ? `Generated with ${vote.summaryModel}` : undefined}>LLM summary</span>
                    {vote.summary}
                  </p>
                )}
                <p className="vote-source-text">
                  <span>Source text</span>
                  {vote.action || "Action text unavailable."}
                </p>
                <div className="supervisor-roll-call" aria-label="Complete roll-call result">
                  <VoteLine label="Ayes" names={vote.ayes} supervisors={supervisorLinks} showWhenEmpty />
                  <VoteLine label="Noes" names={vote.noes} supervisors={supervisorLinks} showWhenEmpty />
                  <VoteLine label="Absent" names={vote.absent} supervisors={supervisorLinks} />
                  <VoteLine label="Excused" names={vote.excused} supervisors={supervisorLinks} />
                </div>
                <div><a href={vote.transcriptUrl}>HTML EVIDENCE</a><a href={vote.markdownUrl}>MARKDOWN</a><a href={vote.officialUrl} target="_blank" rel="noreferrer">OFFICIAL PDF</a></div>
              </li>
            ))}
          </ol>
          {profile.votes.length === 0 && <p className="no-recorded-vote">No recorded positions match this filter.</p>}
        </section>
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    </div>
  );
}

function formatService(start: string | null, end: string | null) {
  if (!start && !end) return "Service dates not available";
  return `${start ?? "Unknown"} to ${end ?? "present"}`;
}
