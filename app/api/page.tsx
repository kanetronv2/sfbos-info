import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API",
  description: "API documentation for the SF BOS full-text search index.",
};

const jsonExample = `GET /api/search?q=affordable+housing&year=2018&kind=minutes
Accept: application/json`;

const markdownExample = `GET /api/search.md?q=who+voted+against+housing&year=2018
Accept: text/markdown`;

export default function ApiPage() {
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
          Page-level full-text search across Board of Supervisors agendas and minutes.
          Responses always include a direct official-document URL.
        </p>

        <section>
          <h2><code>GET /api/search</code></h2>
          <div className="parameter-grid">
            <code>q</code><p>Required. Web-style search query, 2–300 characters.</p>
            <code>year</code><p>Optional. Calendar year from 2012 through 2026.</p>
            <code>kind</code><p>Optional. <code>agenda</code> or <code>minutes</code>.</p>
            <code>limit</code><p>Optional. 1–50 results; defaults to 20.</p>
            <code>format</code><p>Optional. <code>json</code> or <code>md</code>.</p>
          </div>
        </section>

        <section>
          <h2>JSON</h2>
          <pre><code>{jsonExample}</code></pre>
        </section>

        <section>
          <h2>Markdown for LLMs</h2>
          <pre><code>{markdownExample}</code></pre>
          <p>
            Markdown can also be requested from <code>/api/search</code> using
            <code> Accept: text/markdown</code> or <code>?format=md</code>.
          </p>
        </section>

        <section>
          <h2>Discovery</h2>
          <ul>
            <li><a href="/llms.txt">/llms.txt</a></li>
            <li><a href="/openapi.yaml">/openapi.yaml</a></li>
            <li><a href="/index.md">/index.md</a></li>
          </ul>
        </section>
      </main>
    </div>
  );
}
