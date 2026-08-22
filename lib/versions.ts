import { neon } from "@neondatabase/serverless";

export interface DocumentVersion {
  id: string;
  versionNumber: number;
  contentSha256: string;
  pageCount: number;
  parserName: string | null;
  parserVersion: string | null;
  capturedAt: string;
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  if (!process.env.DATABASE_URL || !/^\d+$/.test(documentId)) return [];
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(
    `SELECT dv.id::text, dv.version_number, dv.content_sha256, dv.page_count,
       pr.parser_name, pr.parser_version, dv.captured_at::text
     FROM document_versions dv
     LEFT JOIN parser_runs pr ON pr.id = dv.parser_run_id
     WHERE dv.document_id = $1 ORDER BY dv.version_number DESC`,
    [documentId],
  );
  return rows.map((row) => ({
    id: row.id,
    versionNumber: row.version_number,
    contentSha256: row.content_sha256,
    pageCount: row.page_count,
    parserName: row.parser_name,
    parserVersion: row.parser_version,
    capturedAt: row.captured_at,
  }));
}

export async function diffDocumentVersions(documentId: string, from: number, to: number) {
  if (!process.env.DATABASE_URL || !/^\d+$/.test(documentId)) return null;
  const sql = neon(process.env.DATABASE_URL);
  const versions = await sql.query(
    `SELECT id::text, version_number, content_sha256, captured_at::text
     FROM document_versions
     WHERE document_id = $1 AND version_number = ANY($2::int[])
     ORDER BY version_number`,
    [documentId, [from, to]],
  );
  if (versions.length !== 2 || from === to) return null;
  const fromVersion = versions.find((version) => version.version_number === from);
  const toVersion = versions.find((version) => version.version_number === to);
  if (!fromVersion || !toVersion) return null;
  const [pages, currentPages] = await Promise.all([
    sql.query(
      `SELECT version_id::text, page_number, content_sha256, content
       FROM document_version_pages
       WHERE version_id = ANY($1::bigint[])
       ORDER BY page_number`,
      [[fromVersion.id, toVersion.id]],
    ),
    sql.query(
      `SELECT page_number, md5(content) AS content_sha256, content
       FROM pages WHERE document_id = $1 ORDER BY page_number`,
      [documentId],
    ),
  ]);
  const baseline = () => new Map(currentPages.map((page) => [page.page_number, page]));
  const before = baseline();
  const after = baseline();
  for (const page of pages) {
    const target = page.version_id === fromVersion.id ? before : after;
    if (page.content_sha256 === "absent") target.delete(page.page_number);
    else target.set(page.page_number, page);
  }
  const pageNumbers = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  const changes = pageNumbers.flatMap((pageNumber) => {
    const oldPage = before.get(pageNumber);
    const newPage = after.get(pageNumber);
    if (oldPage?.content_sha256 === newPage?.content_sha256) return [];
    return [{
      pageNumber,
      changeType: !oldPage ? "added" : !newPage ? "removed" : "modified",
      beforeSha256: oldPage?.content_sha256 ?? null,
      afterSha256: newPage?.content_sha256 ?? null,
      lines: lineChanges(oldPage?.content ?? "", newPage?.content ?? ""),
    }];
  });
  return {
    documentId,
    from: { versionNumber: from, contentSha256: fromVersion.content_sha256, capturedAt: fromVersion.captured_at },
    to: { versionNumber: to, contentSha256: toVersion.content_sha256, capturedAt: toVersion.captured_at },
    changedPages: changes.length,
    changes,
  };
}

function lineChanges(before: string, after: string) {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix && suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;
  return {
    removed: oldLines.slice(prefix, oldLines.length - suffix).slice(0, 100),
    added: newLines.slice(prefix, newLines.length - suffix).slice(0, 100),
    truncated: oldLines.length - prefix - suffix > 100 || newLines.length - prefix - suffix > 100,
  };
}
