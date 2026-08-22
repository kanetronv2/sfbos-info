import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "San Francisco Board of Supervisors Search API",
  description: "Provider-neutral JSON and Markdown APIs for searching San Francisco Board of Supervisors records, votes, legislative files, and public comments.",
  alternates: {
    canonical: "/api",
    types: { "application/yaml": "/openapi.yaml", "text/plain": "/llms.txt" },
  },
  openGraph: {
    type: "website",
    url: "/api",
    title: "San Francisco Board of Supervisors Search API",
    description: "JSON and Markdown access to Board records, legislative files, votes, and public comments.",
  },
};

const jsonExample = `GET /api/search?q=affordable+housing&year=2018&kind=minutes
Accept: application/json`;

const markdownExample = `GET /api/search.md?q=who+voted+against+housing&year=2018
Accept: text/markdown`;

const itemExample = `GET /api/items.md?q=housing+production&voter=Chan&position=no&final=true&groupBy=file&from=2021&to=2026
Accept: text/markdown`;

const commentExample = `GET /api/comments.md?q=Great+Highway&from=2021&to=2021
Accept: text/markdown`;

export default function ApiPage() {
  const siteUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "SF BOS Search API",
    description: metadata.description,
    url: `${siteUrl}/api`,
    documentation: `${siteUrl}/openapi.yaml`,
    provider: {
      "@type": "Organization",
      name: "SF BOS Search",
      url: siteUrl,
    },
    termsOfService: `${siteUrl}/llms.txt`,
  };

  return (
    <div className="docs-shell">
      <header className="docs-header">
        <Link href="/" className="wordmark"><span className="prompt-mark">&gt;_</span> sfbos.info</Link>
        <span>API / v1</span>
      </header>
      <main>
        <p className="docs-kicker">PUBLIC · READ-ONLY · CORS ENABLED</p>
        <h1>Search API</h1>
        <p className="docs-lede">
          Page search across agendas and minutes, plus action-aware legislative-item and
          roll-call search for researching votes. Every response links to the official record.
        </p>

        <section>
          <h2><code>GET /api/query</code></h2>
          <p>
            Send a complete natural-language question to receive one compact evidence bundle drawn
            from legislative files, page text, recorded votes, and relevant public comments.
          </p>
          <pre><code>{`GET /api/query.md?q=How+many+housing+units+has+Connie+Chan+voted+against%3F+Which+addresses%3F`}</code></pre>
        </section>

        <section>
          <h2><code>GET /api/search</code></h2>
          <div className="parameter-grid">
            <code>q</code><p>Required. Web-style search query, 2–300 characters.</p>
            <code>year</code><p>Optional. Calendar year from 2012 through 2026.</p>
            <code>kind</code><p>Optional. <code>agenda</code> or <code>minutes</code>.</p>
            <code>limit</code><p>Optional. 1–50 results; defaults to 20.</p>
            <code>format</code><p>Optional. <code>json</code> or <code>md</code>.</p>
          </div>
          <p>
            Every result includes a canonical <code>transcriptUrl</code> with a page anchor and a
            separate <code>officialUrl</code> for the authoritative City PDF.
          </p>
        </section>

        <section>
          <h2><code>GET /api/items</code></h2>
          <p>
            Search complete legislative-file blocks from meeting minutes. Results preserve each
            roll call and the action immediately before it, preventing an Aye or No from being
            interpreted without its motion.
          </p>
          <div className="parameter-grid">
            <code>q</code><p>Required. Searches the item and related files for the same matter.</p>
            <code>voter</code><p>Optional. Recorded surname or full name; for example, <code>Chan</code>.</p>
            <code>position</code><p>Optional. <code>aye</code>, <code>no</code>, <code>absent</code>, or <code>excused</code>. Requires <code>voter</code>.</p>
            <code>final</code><p>Optional boolean. Restrict matches to roll calls classified as final actions.</p>
            <code>groupBy</code><p>Optional. <code>none</code>, <code>file</code>, or <code>matter</code> to collapse repeated readings and companion records.</p>
            <code>from / to</code><p>Optional inclusive year range, 2012–2026.</p>
            <code>limit</code><p>Optional. 1–50 results; defaults to 20.</p>
            <code>format</code><p>Optional. <code>json</code> or <code>md</code>.</p>
          </div>
          <pre><code>{itemExample}</code></pre>
          <p>
            Use <code>/api/items.md</code> for Markdown. A position is not automatically a stance:
            an Aye on “disapprove” opposes the underlying project, while an Aye on “table
            disapproval” supports it. The returned action text makes that distinction explicit.
          </p>
        </section>

        <section>
          <h2><code>GET /api/comments</code></h2>
          <p>
            Search clerk-written public-comment summaries as individual speaker statements instead
            of mixed page snippets.
          </p>
          <div className="parameter-grid">
            <code>q</code><p>Required. Topic or phrase to search.</p>
            <code>speaker</code><p>Optional speaker-name filter.</p>
            <code>from / to</code><p>Optional inclusive year range, 2012–2026.</p>
            <code>limit</code><p>Optional. 1–50 results; defaults to 20.</p>
          </div>
          <pre><code>{commentExample}</code></pre>
        </section>

        <section>
          <h2>JSON</h2>
          <pre><code>{jsonExample}</code></pre>
        </section>

        <section>
          <h2>Markdown for any model</h2>
          <pre><code>{markdownExample}</code></pre>
          <p>
            The interface is provider-neutral. Markdown can also be requested from <code>/api/search</code> using
            <code> Accept: text/markdown</code> or <code>?format=md</code>.
          </p>
        </section>

        <section>
          <h2>Discovery</h2>
          <ul>
            <li><Link href="/documents">/documents: complete PDF archive</Link></li>
            <li><a href="/llms.txt">/llms.txt</a></li>
            <li><a href="/openapi.yaml">/openapi.yaml</a></li>
            <li><a href="/index.md">/index.md</a></li>
          </ul>
        </section>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
