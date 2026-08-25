import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = neon(process.env.DATABASE_URL);
const argumentsMap = parseArguments(process.argv.slice(2));
const fromYear = Number(argumentsMap.get("from-year") ?? 1996);
const toYear = Number(argumentsMap.get("to-year") ?? 2026);
const documentLimit = Number(argumentsMap.get("limit") ?? Number.POSITIVE_INFINITY);
const force = argumentsMap.has("force");
const dryRun = argumentsMap.has("dry-run");

const documents = (await sql.query(
  `
    SELECT id::text, meeting_date::text, title, public_comments_indexed_at
    FROM documents
    WHERE kind = 'minutes' AND year BETWEEN $1 AND $2
    ORDER BY meeting_date, id
  `,
  [fromYear, toYear],
)).slice(0, documentLimit);

console.log(`Parsing speaker-level public comments from ${documents.length} minutes documents.`);
let indexed = 0;
let skipped = 0;
let commentCount = 0;

for (const document of documents) {
  if (!force && document.public_comments_indexed_at) {
    skipped += 1;
    continue;
  }

  const pages = await sql.query(
    "SELECT page_number, content FROM pages WHERE document_id = $1 ORDER BY page_number",
    [document.id],
  );
  const comments = parseComments(pages);

  if (!dryRun) {
    await sql.query("DELETE FROM public_comments WHERE document_id = $1", [document.id]);
    if (comments.length) {
      await sql.query(
        `
          INSERT INTO public_comments (document_id, page_number, ordinal, speaker, content)
          SELECT $1, x.page_number, x.ordinal, x.speaker, x.content
          FROM jsonb_to_recordset($2::jsonb) AS x(
            page_number integer,
            ordinal integer,
            speaker text,
            content text
          )
        `,
        [document.id, JSON.stringify(comments)],
      );
    }
    await sql.query("UPDATE documents SET public_comments_indexed_at = now() WHERE id = $1", [document.id]);
  }

  indexed += 1;
  commentCount += comments.length;
  if (indexed % 50 === 0 || indexed + skipped === documents.length) {
    console.log(`[${indexed + skipped}/${documents.length}] ${document.meeting_date}: ${comments.length} comments`);
  }
}

console.log(
  `${dryRun ? "Dry run complete" : "Done"}. Parsed ${commentCount} comments; skipped ${skipped} documents.`,
);

function parseComments(pages) {
  const comments = [];
  let inPublicComment = false;
  let current = null;

  const flush = () => {
    if (!current) return;
    current.content = normalizeWhitespace(current.content);
    if (current.content) comments.push({ ...current, ordinal: comments.length + 1 });
    current = null;
  };

  for (const page of pages) {
    for (const rawLine of page.content.replace(/\u0000/g, "").split("\n")) {
      const line = rawLine.trim();
      if (/^PUBLIC COMMENT(?:\s+CONTINUED)?$/i.test(line)) {
        flush();
        inPublicComment = true;
        continue;
      }
      if (inPublicComment && isSectionBoundary(line)) {
        flush();
        inPublicComment = false;
        continue;
      }
      if (!inPublicComment || !line || isPageFurniture(line)) continue;

      const speaker = line.match(/^([^;]{2,80});\s*(.*)$/u);
      if (speaker && isSpeakerName(speaker[1])) {
        flush();
        current = {
          page_number: Number(page.page_number),
          speaker: normalizeWhitespace(speaker[1]),
          content: speaker[2],
        };
      } else if (current) {
        current.content += ` ${line}`;
      }
    }
  }
  flush();
  return comments;
}

function isSpeakerName(value) {
  const name = value.trim();
  return /^(?:Speaker|[\p{L}][\p{L} .,'’()-]{0,79})$/u.test(name) && name.split(/\s+/).length <= 8;
}

function isSectionBoundary(line) {
  return /^(?:FOR ADOPTION WITHOUT COMMITTEE REFERENCE|ROLL CALL FOR INTRODUCTIONS|COMMITTEE REPORTS|REGULAR AGENDA|UNFINISHED BUSINESS|NEW BUSINESS|IMPERATIVE AGENDA|CLOSED SESSION|LEGISLATION INTRODUCED AT ROLL CALL|SPECIAL ORDER|ADJOURNMENT)\b/i.test(line);
}

function isPageFurniture(line) {
  return /^(?:Board of Supervisors|City and County of San Francisco|Page \d+|Printed at)/i.test(line);
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseArguments(args) {
  const map = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) map.set(key, true);
    else {
      map.set(key, next);
      index += 1;
    }
  }
  return map;
}
