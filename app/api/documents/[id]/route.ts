import { documentMarkdownUrl, documentUrl } from "@/lib/document-url";
import { getDocumentEvidence } from "@/lib/documents";

type DocumentMarkdownRouteProps = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(request: Request, { params }: DocumentMarkdownRouteProps) {
  const { id } = await params;
  const document = await getDocumentEvidence(id);
  if (!document) return new Response("# Document not found\n", { status: 404, headers: markdownHeaders() });

  const requestedPages = new URL(request.url).searchParams.get("pages");
  const pageNumbers = parsePageSelection(requestedPages, document.pageCount);
  if (requestedPages && !pageNumbers) {
    return new Response(
      `# Invalid page selection\n\nUse a page number or inclusive range such as \`pages=5-7\`. This document has ${document.pageCount} pages.\n`,
      { status: 400, headers: markdownHeaders() },
    );
  }

  const selectedPages = pageNumbers
    ? document.pages.filter((page) => pageNumbers.has(page.pageNumber))
    : document.pages;
  const htmlUrl = documentUrl(document.id, document.meetingDate, document.kind);
  const markdownUrl = documentMarkdownUrl(document.id, document.meetingDate, document.kind);

  return new Response(toMarkdown(document, selectedPages), {
    headers: {
      ...markdownHeaders(),
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Location": markdownUrl,
      Link: `<${htmlUrl}>; rel="alternate"; type="text/html", </llms.txt>; rel="describedby"`,
    },
  });
}

function parsePageSelection(value: string | null, pageCount: number) {
  if (!value) return null;
  const match = value.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start < 1 || end < start || end > pageCount || end - start > 49) return undefined;
  return new Set(Array.from({ length: end - start + 1 }, (_, index) => start + index));
}

function toMarkdown(
  document: NonNullable<Awaited<ReturnType<typeof getDocumentEvidence>>>,
  pages: NonNullable<Awaited<ReturnType<typeof getDocumentEvidence>>>["pages"],
) {
  const htmlUrl = documentUrl(document.id, document.meetingDate, document.kind);
  const firstPage = pages.at(0)?.pageNumber ?? 1;
  const lastPage = pages.at(-1)?.pageNumber ?? document.pageCount;
  const items = pages.length === document.pages.length
    ? document.items
    : document.items.filter((item) => item.endPage >= firstPage && item.startPage <= lastPage);
  const lines = [
    `# ${document.title}`,
    "",
    `- Meeting date: ${document.meetingDate}`,
    `- Document type: ${document.kind}`,
    `- Source format: ${document.sourceFormat.toUpperCase()}`,
    `- Extracted pages: ${document.pageCount}`,
    `- [Canonical HTML transcript](${htmlUrl})`,
    `- [Authoritative City source](${document.officialUrl})`,
    "",
    document.pageCount
      ? "> This text was extracted for search and accessibility. The linked City source is the authoritative public record."
      : "> This legacy document is cataloged, but extracted text is not yet available. Follow the linked City source for the public record.",
    "",
  ];

  if (items.length) {
    lines.push("## Structured legislative records", "");
    for (const item of items) {
      lines.push(
        `### File ${item.fileNumber}: ${item.title}`,
        "",
        `- Pages: ${pageRange(item.startPage, item.endPage)}`,
      );
      for (const rollCall of item.rollCalls) {
        lines.push(
          `- Vote ${rollCall.sequence}: ${rollCall.actionType}${rollCall.isFinal ? ", likely final" : ""}`,
          `  - Action: ${normalizeWhitespace(rollCall.action) || "Action text unavailable."}`,
        );
        if (rollCall.ayes.length) lines.push(`  - Ayes: ${rollCall.ayes.join(", ")}`);
        if (rollCall.noes.length) lines.push(`  - Noes: ${rollCall.noes.join(", ")}`);
        if (rollCall.absent.length) lines.push(`  - Absent: ${rollCall.absent.join(", ")}`);
        if (rollCall.excused.length) lines.push(`  - Excused: ${rollCall.excused.join(", ")}`);
      }
      lines.push("");
    }
  }

  lines.push("## Extracted text", "");
  for (const page of pages) {
    lines.push(
      `### [Page ${page.pageNumber}](${htmlUrl}#page-${page.pageNumber})`,
      "",
      page.content,
      "",
    );
  }
  return lines.join("\n");
}

function pageRange(start: number, end: number) {
  return start === end ? String(start) : `${start}-${end}`;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function markdownHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Robots-Tag": "noindex, follow",
  };
}
