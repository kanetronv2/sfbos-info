"use client";

import Link from "next/link";
import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { supervisorNames } from "@/lib/search-intent";
import type { SearchResponse, SearchResult, SearchResultType } from "@/lib/types";

const examples = ["469 Stevenson", "William Palmer", "Fentanyl", "Urban Alchemy"];
const tabs: Array<{ value: SearchResultType; label: string }> = [
  { value: "all", label: "All" }, { value: "legislation", label: "Legislation" },
  { value: "votes", label: "Votes" }, { value: "comments", label: "Public comments" },
  { value: "pages", label: "PDF text" },
];

interface FilterState {
  type: SearchResultType; from: string; to: string; supervisor: string;
  position: string; final: boolean;
}
const defaultFilters: FilterState = { type: "all", from: "", to: "", supervisor: "", position: "", final: false };

export function SearchApp() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams(window.location.search);
      const initialQuery = parameters.get("q") ?? "";
      const initialFilters: FilterState = {
        type: parseType(parameters.get("type")),
        from: parameters.get("from") ?? parameters.get("year") ?? "",
        to: parameters.get("to") ?? parameters.get("year") ?? "",
        supervisor: parameters.get("supervisor") ?? parameters.get("voter") ?? "",
        position: parameters.get("position") ?? "",
        final: ["true", "1"].includes(parameters.get("final") ?? ""),
      };
      setQuery(initialQuery);
      setFilters(initialFilters);
      if (initialQuery) void runSearch(initialQuery, initialFilters);
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !["INPUT", "SELECT"].includes(document.activeElement?.tagName ?? "")) {
        event.preventDefault(); inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onKeyDown); requestRef.current?.abort(); };
    // URL state is intentionally read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(nextQuery = query, nextFilters = filters) {
    const trimmedQuery = nextQuery.trim();
    if (!trimmedQuery) { setResponse(null); inputRef.current?.focus(); return; }
    setLoading(true); setError(""); requestRef.current?.abort();
    const requestController = new AbortController(); requestRef.current = requestController;
    const parameters = searchParameters(trimmedQuery, nextFilters);
    window.history.replaceState(null, "", `/?${parameters.toString()}`);
    try {
      const request = await fetch(`/api/search?${parameters.toString()}`, { signal: requestController.signal });
      const payload = (await request.json()) as SearchResponse & { error?: string };
      if (!request.ok) throw new Error(payload.error ?? "Search failed");
      setResponse(payload);
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === "AbortError") return;
      setError(searchError instanceof Error ? searchError.message : "Search failed"); setResponse(null);
    } finally {
      if (requestRef.current === requestController) { requestRef.current = null; setLoading(false); }
    }
  }

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void runSearch(); }
  function chooseExample(example: string) { setQuery(example); void runSearch(example, filters); }
  function chooseTab(type: SearchResultType) {
    const nextFilters = { ...filters, type }; setFilters(nextFilters); void runSearch(query, nextFilters);
  }
  function clearSearch() {
    setQuery(""); setFilters(defaultFilters); setResponse(null); setError(""); requestRef.current?.abort(); setLoading(false);
  }

  return <div className="site-shell">
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="SF BOS Search home" onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; clearSearch();
      }}><span className="prompt-mark" aria-hidden="true">&gt;_</span><span>sfbos.info</span></Link>
      <nav aria-label="Primary navigation"><Link href="/documents">PDFS</Link><Link href="/supervisors">SUPERVISORS</Link><Link href="/api">API</Link><a href="/llms.txt">FOR MODELS</a></nav>
    </header>

    <main className={`main-content ${response ? "has-results" : ""}`}>
      <section className="search-intro" aria-labelledby="page-title">
        <div className="eyebrow"><span className="live-dot" /> PUBLIC RECORD SEARCH</div>
        <h1 id="page-title">Search the San Francisco<br />Board of Supervisors.</h1>
        <form className="search-form" onSubmit={submit}>
          <div className="search-box"><span className="search-glyph" aria-hidden="true">⌕</span>
            <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about a file, vote, address, speaker, or topic…" aria-label="Search board records" autoComplete="off" />
            <kbd>/</kbd><button type="submit" disabled={loading || !query.trim()}>{loading ? "Searching" : "Search"}<span aria-hidden="true">↵</span></button>
          </div>
          <div className="filters search-filters">
            <label><span>From</span><select value={filters.from} onChange={(event) => updateFilter("from", event.target.value)}><option value="">2012</option>{years().map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            <label><span>To</span><select value={filters.to} onChange={(event) => updateFilter("to", event.target.value)}><option value="">2026</option>{years().map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            <label><span>Supervisor</span><select value={filters.supervisor} onChange={(event) => updateFilter("supervisor", event.target.value)}><option value="">Any</option>{supervisorNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label><span>Vote</span><select value={filters.position} onChange={(event) => updateFilter("position", event.target.value)}><option value="">Any</option><option value="aye">Aye</option><option value="no">No</option><option value="absent">Absent</option><option value="excused">Excused</option></select></label>
            <label className="checkbox-filter"><input type="checkbox" checked={filters.final} onChange={(event) => updateFilter("final", event.target.checked)} /><span>Final actions</span></label>
          </div>
        </form>
        {!response && !loading && <div className="examples"><span>TRY</span>{examples.map((example) => <button key={example} type="button" onClick={() => chooseExample(example)}>{example}</button>)}</div>}
      </section>

      {error && <div className="error-message" role="alert">{error}</div>}
      {response && <section className="results" aria-live="polite" aria-label="Search results">
        <div className="result-tabs" role="tablist" aria-label="Result type">{tabs.map((tab) => {
          const count = facetCount(response, tab.value);
          return <button key={tab.value} type="button" role="tab" aria-selected={filters.type === tab.value} className={filters.type === tab.value ? "active" : ""} onClick={() => chooseTab(tab.value)}>{tab.label}{count !== null ? <span>{count}</span> : null}</button>;
        })}</div>
        <div className="results-meta"><p><strong>{response.total}</strong> record{response.total === 1 ? "" : "s"} matched <code>{response.query}</code></p><a href={markdownUrl(response.query, filters)}>VIEW AS MARKDOWN ↗</a></div>
        {response.intent?.searchQuery && response.intent.searchQuery !== response.query && <div className="query-interpretation">Interpreted as <code>{response.intent.searchQuery}</code>{response.filters.supervisor ? <> · Supervisor <strong>{response.filters.supervisor}</strong></> : null}{response.filters.position ? <> · Recorded <strong>{response.filters.position.toUpperCase()}</strong></> : null}</div>}
        {response.source === "preview" && <div className="preview-notice">Preview index: connect <code>DATABASE_URL</code> and run the ingester for the complete archive.</div>}
        {response.results.length === 0 ? <div className="empty-state"><span>0x00</span><h2>No matching records.</h2><p>Try fewer terms or remove a filter.</p></div> : <ol className="result-list">{response.results.map((result, index) => <ResultRow key={result.id} result={result} index={index} query={response.intent?.searchQuery ?? response.query} />)}</ol>}
      </section>}
    </main>
    <footer><div>Independent public-interest index. Not affiliated with the City and County of San Francisco.</div><div><span>JSON</span><span>MARKDOWN</span><span>UTF-8</span></div></footer>
  </div>;
}

function ResultRow({ result, index, query }: { result: SearchResult; index: number; query: string }) {
  const label = { legislation: "LEGISLATION", votes: "VOTE RECORD", comments: "PUBLIC COMMENT", pages: "PDF TEXT" }[result.resultType ?? "pages"];
  return <li><div className="result-index">{String(index + 1).padStart(2, "0")}</div><article>
    <div className="result-labels"><span>{label}</span><time dateTime={result.meetingDate}>{formatDate(result.meetingDate)}</time>{result.fileNumber ? <span>FILE {result.fileNumber}</span> : <span>{result.kind} · p. {result.page}</span>}{result.groupCount && result.groupCount > 1 ? <span>{result.groupCount} appearances</span> : null}</div>
    <h2><a href={result.transcriptUrl}>{result.title}</a></h2>
    {result.action && <div className="vote-evidence"><strong>{result.recordedPosition ? `${result.recordedPosition.toUpperCase()} · ` : ""}{humanize(result.actionType ?? "vote")}</strong><span>{shorten(result.action, 240)}</span>{result.isFinal ? <em>FINAL</em> : null}</div>}
    <p><HighlightedText text={result.snippet} query={query} /></p><ResultFacts result={result} />
    <div className="result-source-links"><a href={result.transcriptUrl}>{result.fileNumber ? `STRUCTURED RECORD, FILE ${result.fileNumber} →` : `EXTRACTED TEXT, PAGE ${result.page} →`}</a><a href={result.officialUrl} target="_blank" rel="noreferrer">OFFICIAL PDF ↗</a></div>
    <div className="source-url">{shortUrl(result.transcriptUrl)}</div>
  </article></li>;
}

function ResultFacts({ result }: { result: SearchResult }) {
  const facts = [result.extracted?.housingUnits.length ? `${result.extracted.housingUnits.join(", ")} units` : null, ...(result.matchedEntities ?? []), ...(result.extracted?.addresses.slice(0, 3) ?? []), ...(result.extracted?.parties.slice(0, 2) ?? [])].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  return facts.length ? <div className="result-facts">{facts.map((fact) => <span key={fact}>{fact}</span>)}</div> : null;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = query.replace(/\bOR\b|["()]/g, " ").split(/\s+/).filter((term) => term.length > 1);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return text.split(pattern).map((part, index) => terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? <mark key={`${part}-${index}`}>{part}</mark> : <Fragment key={`${part}-${index}`}>{part}</Fragment>);
}

function searchParameters(query: string, filters: FilterState) {
  const parameters = new URLSearchParams({ q: query, mode: "hybrid" });
  if (filters.type !== "all") parameters.set("type", filters.type);
  if (filters.from) parameters.set("from", filters.from); if (filters.to) parameters.set("to", filters.to);
  if (filters.supervisor) parameters.set("supervisor", filters.supervisor); if (filters.position) parameters.set("position", filters.position);
  if (filters.final) parameters.set("final", "true"); return parameters;
}
function markdownUrl(query: string, filters: FilterState) { return `/api/search.md?${searchParameters(query, filters).toString()}`; }
function facetCount(response: SearchResponse, type: SearchResultType) {
  const activeType = response.filters.type ?? "all";
  if (activeType !== "all" && type !== activeType) return null;
  return type === "all" ? response.returned : response.facets?.[type] ?? 0;
}
function parseType(value: string | null): SearchResultType { return value && ["all", "legislation", "votes", "comments", "pages"].includes(value) ? value as SearchResultType : "all"; }
function years() { return Array.from({ length: 15 }, (_, index) => 2026 - index); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function humanize(value: string) { return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function shorten(value: string, length: number) { const clean = value.replace(/\s+/g, " ").trim(); return clean.length > length ? `${clean.slice(0, length).replace(/\s+\S*$/, "")}…` : clean; }
function shortUrl(value: string) { try { const url = new URL(value); return `${url.hostname}${url.pathname}${url.hash}`; } catch { return value; } }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
