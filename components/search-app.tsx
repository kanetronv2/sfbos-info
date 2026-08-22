"use client";

import Link from "next/link";
import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import type { DocumentKind, SearchResponse } from "@/lib/types";

const examples = [
  "affordable housing",
  "police overtime",
  "zoning appeal",
  "public comment",
];

const examplePrompt =
  "How many housing units has Connie Chan voted against? Which addresses? Use https://sfbos.info";

export function SearchApp() {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [kind, setKind] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const urlStateTimer = window.setTimeout(() => {
      const parameters = new URLSearchParams(window.location.search);
      const initialQuery = parameters.get("q") ?? "";
      const initialYear = parameters.get("year") ?? "";
      const initialKind = parameters.get("kind") ?? "";
      setQuery(initialQuery);
      setYear(initialYear);
      setKind(initialKind);
      if (initialQuery) void runSearch(initialQuery, initialYear, initialKind);
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(urlStateTimer);
      window.removeEventListener("keydown", onKeyDown);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
    // Initial URL state is intentionally read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(nextQuery = query, nextYear = year, nextKind = kind) {
    const trimmedQuery = nextQuery.trim();
    if (!trimmedQuery) {
      setResponse(null);
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError("");

    const parameters = new URLSearchParams({ q: trimmedQuery });
    if (nextYear) parameters.set("year", nextYear);
    if (nextKind) parameters.set("kind", nextKind);
    window.history.replaceState(null, "", `/?${parameters.toString()}`);

    try {
      const request = await fetch(`/api/search?${parameters.toString()}`);
      const payload = (await request.json()) as SearchResponse & { error?: string };
      if (!request.ok) throw new Error(payload.error ?? "Search failed");
      setResponse(payload);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
  }

  function chooseExample(example: string) {
    setQuery(example);
    void runSearch(example, year, kind);
  }

  async function copyExamplePrompt() {
    try {
      await navigator.clipboard.writeText(examplePrompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="SF BOS Search home">
          <span className="prompt-mark" aria-hidden="true">&gt;_</span>
          <span>sfbos.info</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/documents">PDFS</Link>
          <Link href="/supervisors">SUPERVISORS</Link>
          <Link href="/api">API</Link>
          <a href="/llms.txt">FOR MODELS</a>
        </nav>
      </header>

      <main className={`main-content ${response ? "has-results" : ""}`}>
        <section className="search-intro" aria-labelledby="page-title">
          <div className="eyebrow"><span className="live-dot" /> PUBLIC RECORD SEARCH</div>
          <h1 id="page-title">Search the San Francisco<br />Board of Supervisors.</h1>

          <form className="search-form" onSubmit={submit}>
            <div className="search-box">
              <span className="search-glyph" aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search names, votes, legislation, addresses…"
                aria-label="Search board records"
                autoComplete="off"
              />
              <kbd>/</kbd>
              <button type="submit" disabled={loading || !query.trim()}>
                {loading ? "Searching" : "Search"}<span aria-hidden="true">↵</span>
              </button>
            </div>

            <div className="filters">
              <label>
                <span>Year</span>
                <select value={year} onChange={(event) => setYear(event.target.value)}>
                  <option value="">All years</option>
                  {Array.from({ length: 15 }, (_, index) => 2026 - index).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Document</span>
                <select value={kind} onChange={(event) => setKind(event.target.value)}>
                  <option value="">Agenda + minutes</option>
                  <option value="agenda">Agendas</option>
                  <option value="minutes">Minutes</option>
                </select>
              </label>
              <div className="corpus-stat" aria-label="Corpus statistics">
                <strong>1,149</strong> PDFs <i /> <strong>2012-2026</strong>
              </div>
            </div>
          </form>

          {!response && !loading && (
            <aside className="model-callout" aria-labelledby="model-callout-title">
              <div>
                <p className="model-callout-kicker">DESIGNED FOR LLMs</p>
                <h2 id="model-callout-title">Search here, or give the site to your preferred model.</h2>
                <p>
                  The index above is available for direct research. For deeper questions, the most
                  effective way to use this archive is to give <code>https://sfbos.info</code> to any
                  LLM. It can query the structured API, read Markdown, and follow official City sources.
                </p>
                <a href="/llms.txt">MODEL ACCESS GUIDE ↗</a>
              </div>
              <div className="example-prompt">
                <div className="example-prompt-header">
                  <span className="example-prompt-label">EXAMPLE PROMPT</span>
                  <div className="copy-prompt-control">
                    <span className="copy-prompt-status" role="status" aria-live="polite">
                      {copyState === "copied" ? "COPIED" : copyState === "error" ? "COPY FAILED" : ""}
                    </span>
                    <button
                      className="copy-prompt-button"
                      type="button"
                      onClick={() => void copyExamplePrompt()}
                      aria-label={copyState === "copied" ? "Example prompt copied" : "Copy example prompt"}
                      title="Copy example prompt"
                    >
                      {copyState === "copied" ? (
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                      ) : (
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <rect x="8" y="8" width="11" height="11" rx="1" />
                          <path d="M16 8V5H5v11h3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <code>{examplePrompt}</code>
              </div>
            </aside>
          )}

          {!response && !loading && (
            <div className="examples">
              <span>TRY</span>
              {examples.map((example) => (
                <button key={example} type="button" onClick={() => chooseExample(example)}>
                  {example}
                </button>
              ))}
            </div>
          )}
        </section>

        {error && <div className="error-message" role="alert">{error}</div>}

        {response && (
          <section className="results" aria-live="polite" aria-label="Search results">
            <div className="results-meta">
              <p><strong>{response.total}</strong> page{response.total === 1 ? "" : "s"} matched <code>{response.query}</code></p>
              <a href={markdownUrl(response.query, response.filters.year, response.filters.kind)}>
                VIEW AS MARKDOWN ↗
              </a>
            </div>

            {response.source === "preview" && (
              <div className="preview-notice">
                Preview index: connect <code>DATABASE_URL</code> and run the ingester for the complete archive.
              </div>
            )}

            {response.results.length === 0 ? (
              <div className="empty-state">
                <span>0x00</span>
                <h2>No matching pages.</h2>
                <p>Try fewer terms or remove a filter.</p>
              </div>
            ) : (
              <ol className="result-list">
                {response.results.map((result, index) => (
                  <li key={result.id}>
                    <div className="result-index">{String(index + 1).padStart(2, "0")}</div>
                    <article>
                      <div className="result-labels">
                        <span>{result.kind}</span>
                        <time dateTime={result.meetingDate}>{formatDate(result.meetingDate)}</time>
                        <span>p. {result.page}</span>
                      </div>
                      <h2>
                        <a href={result.transcriptUrl}>
                          {result.title}
                        </a>
                      </h2>
                      <p><HighlightedText text={result.snippet} query={response.query} /></p>
                      <div className="result-source-links">
                        <a href={result.transcriptUrl}>EXTRACTED TEXT, PAGE {result.page} →</a>
                        <a href={result.officialUrl} target="_blank" rel="noreferrer">OFFICIAL PDF ↗</a>
                      </div>
                      <div className="source-url">{shortUrl(result.transcriptUrl)}</div>
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </main>

      <footer>
        <div>Independent public-interest index. Not affiliated with the City and County of San Francisco.</div>
        <div><span>JSON</span> <span>MARKDOWN</span> <span>UTF-8</span></div>
      </footer>
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = query.split(/\s+/).filter((term) => term.length > 1);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    ),
  );
}

function markdownUrl(query: string, year: number | null, kind: DocumentKind | null) {
  const parameters = new URLSearchParams({ q: query });
  if (year) parameters.set("year", String(year));
  if (kind) parameters.set("kind", kind);
  return `/api/search.md?${parameters.toString()}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function shortUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${url.hash}`;
  } catch {
    return value;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
