import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { getQualityReport } from "@/lib/quality";

export const metadata: Metadata = {
  title: "SF BOS Search Data Quality and Coverage",
  description: "Review document coverage, identifier reconciliation, extraction confidence, parser provenance, and ingestion health for the SF BOS public-record index.",
  alternates: { canonical: "/quality" },
  openGraph: {
    type: "website",
    url: "/quality",
    title: "SF BOS Search Data Quality and Coverage",
    description: "Public coverage and extraction-quality metrics for the SF BOS public-record index.",
  },
};
export const revalidate = 300;

export default async function QualityPage() {
  const report = await getQualityReport();
  if (!report) return <div className="docs-shell"><SiteHeader /><main>Database is not configured.</main></div>;
  const metrics = report.metrics;
  return <div className="docs-shell"><SiteHeader /><main>
    <p className="docs-kicker">OBSERVABLE PIPELINE</p><h1>Data quality</h1><p className="docs-lede">Coverage, identifier reconciliation, extraction confidence, parser versions, and recent ingestion status.</p>
    <section><h2>Coverage</h2><div className="quality-grid">
      <Metric label="Documents" value={metrics.documents} /><Metric label="Indexed documents" value={metrics.indexed_documents} />
      <Metric label="Catalog only" value={metrics.catalog_only_documents} /><Metric label="Without pages" value={metrics.documents_without_pages} bad={metrics.documents_without_pages > 0} />
      <Metric label="Without versions" value={metrics.documents_without_versions} bad={metrics.documents_without_versions > 0} /><Metric label="Legislative items" value={metrics.legislative_items} />
      <Metric label="Recorded positions" value={metrics.recorded_positions} /><Metric label="Unresolved names" value={metrics.unresolved_positions} bad={metrics.unresolved_positions > 0} />
      <Metric label="Evidence spans" value={metrics.evidence_spans} /><Metric label="Low confidence" value={metrics.low_confidence_spans} bad={metrics.low_confidence_spans > 0} />
      <Metric label="Internal files" value={metrics.reconciled_files} /><Metric label="Legistar matched" value={metrics.legistar_matched_files} />
    </div></section>
    <section><h2>Parser versions</h2><pre>{JSON.stringify(report.parserVersions, null, 2)}</pre></section>
    <section><h2>Recent ingestion runs</h2><pre>{JSON.stringify(report.recentIngestionRuns, null, 2)}</pre></section>
    {report.unresolvedRecordedNames.length > 0 && <section><h2>Unresolved recorded names</h2><pre>{JSON.stringify(report.unresolvedRecordedNames, null, 2)}</pre></section>}
  </main></div>;
}

function Metric({ label, value, bad = false }: { label: string; value: number; bad?: boolean }) {
  return <div className={bad ? "quality-bad" : ""}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong></div>;
}
