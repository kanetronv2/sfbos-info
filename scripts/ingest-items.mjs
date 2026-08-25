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
    SELECT id::text, meeting_date::text, title
    FROM documents
    WHERE kind = 'minutes' AND year BETWEEN $1 AND $2
    ORDER BY meeting_date, id
  `,
  [fromYear, toYear],
)).slice(0, documentLimit);

console.log(`Parsing legislative items from ${documents.length} minutes documents.`);

let indexed = 0;
let skipped = 0;
let itemCount = 0;
let rollCallCount = 0;

for (const document of documents) {
  if (!force && await isAlreadyIndexed(document.id)) {
    skipped += 1;
    continue;
  }

  const pages = await sql.query(
    "SELECT page_number, content FROM pages WHERE document_id = $1 ORDER BY page_number",
    [document.id],
  );
  const items = parseItems(pages);

  if (!dryRun) {
    await sql.query("DELETE FROM legislative_items WHERE document_id = $1", [document.id]);
    if (items.length) await insertItems(document.id, items);
  }

  indexed += 1;
  itemCount += items.length;
  rollCallCount += items.reduce((sum, item) => sum + item.rollCalls.length, 0);

  if (indexed % 25 === 0 || indexed + skipped === documents.length) {
    console.log(`[${indexed + skipped}/${documents.length}] ${document.meeting_date}: ${items.length} items`);
  }
}

console.log(
  `${dryRun ? "Dry run complete" : "Done"}. Parsed ${itemCount} items and ${rollCallCount} roll calls; skipped ${skipped} documents.`,
);

async function isAlreadyIndexed(documentId) {
  const [row] = await sql.query(
    "SELECT 1 FROM legislative_items WHERE document_id = $1 LIMIT 1",
    [documentId],
  );
  return Boolean(row);
}

async function insertItems(documentId, items) {
  const itemPayload = items.map((item) => ({
    ordinal: item.ordinal,
    file_number: item.file_number,
    title: item.title,
    content: item.content,
    matter: item.matter,
    context: item.context,
    start_page: item.start_page,
    end_page: item.end_page,
  }));
  await sql.query(
    `
      INSERT INTO legislative_items (
        document_id, ordinal, file_number, title, content, matter, context, start_page, end_page
      )
      SELECT $1, x.ordinal, x.file_number, x.title, x.content, x.matter, x.context, x.start_page, x.end_page
      FROM jsonb_to_recordset($2::jsonb) AS x(
        ordinal integer,
        file_number text,
        title text,
        content text,
        matter text,
        context text,
        start_page integer,
        end_page integer
      )
    `,
    [documentId, JSON.stringify(itemPayload)],
  );

  const rollCallPayload = items.flatMap((item) =>
    item.rollCalls.map((rollCall) => ({ itemOrdinal: item.ordinal, ...rollCall })),
  );
  if (!rollCallPayload.length) return;

  await sql.query(
    `
      INSERT INTO roll_calls (item_id, sequence, action, ayes, noes, absent, excused)
      SELECT i.id, x.sequence, x.action, x.ayes, x.noes, x.absent, x.excused
      FROM jsonb_to_recordset($2::jsonb) AS x(
        item_ordinal integer,
        sequence integer,
        action text,
        ayes text[],
        noes text[],
        absent text[],
        excused text[]
      )
      JOIN legislative_items i
        ON i.document_id = $1 AND i.ordinal = x.item_ordinal
    `,
    [documentId, JSON.stringify(rollCallPayload.map((rollCall) => ({
      item_ordinal: rollCall.itemOrdinal,
      sequence: rollCall.sequence,
      action: rollCall.action,
      ayes: rollCall.ayes,
      noes: rollCall.noes,
      absent: rollCall.absent,
      excused: rollCall.excused,
    })))],
  );
}

function parseItems(pages) {
  const pageOffsets = [];
  let combined = "";
  for (const page of pages) {
    pageOffsets.push({ offset: combined.length, page: Number(page.page_number) });
    combined += `${page.content.replace(/\u0000/g, "")}\n`;
  }

  const headerPattern = /^[ \t]*(\d{6})\s+\[([\s\S]*?)\]/gm;
  const headers = [...combined.matchAll(headerPattern)];

  const items = headers.map((header, index) => {
    const start = header.index ?? 0;
    const rawEnd = headers[index + 1]?.index ?? combined.length;
    const content = trimAtSectionBoundary(combined.slice(start, rawEnd)).trim();
    const end = start + content.length;
    const title = normalizeWhitespace(header[2]);
    return {
      ordinal: index + 1,
      file_number: header[1],
      title,
      content,
      matter: matterKey(title),
      context: "",
      start_page: pageAtOffset(pageOffsets, start),
      end_page: pageAtOffset(pageOffsets, Math.max(start, end - 1)),
      rollCalls: parseRollCalls(content),
    };
  });

  const matterContexts = new Map();
  for (const item of items) {
    const summaries = matterContexts.get(item.matter) ?? [];
    summaries.push(`${item.file_number} ${item.title}. ${itemSummary(item.content)}`);
    matterContexts.set(item.matter, summaries);
  }
  for (const item of items) {
    item.context = (matterContexts.get(item.matter) ?? []).join("\n");
  }
  return items;
}

function trimAtSectionBoundary(content) {
  const boundary = content.match(
    /\n\s*(?:ROLL CALL FOR INTRODUCTIONS|PUBLIC COMMENT|FOR ADOPTION WITHOUT COMMITTEE REFERENCE|SPECIAL ORDER(?:\s+\d[^\n]*)?|COMMITTEE REPORTS|REGULAR AGENDA|UNFINISHED BUSINESS|NEW BUSINESS|IMPERATIVE AGENDA|CLOSED SESSION|LEGISLATION INTRODUCED AT ROLL CALL|Severed from the [^\n]+ Agenda|Board of Supervisors Sitting as a Committee of the Whole)\s*\n/i,
  );
  return boundary?.index === undefined ? content : content.slice(0, boundary.index);
}

function matterKey(title) {
  const subject = title.split(/\s+-\s+/).at(-1) ?? title;
  return normalizeWhitespace(subject)
    .replace(/^proposed\s+/i, "")
    .replace(/\s+-\s+\w+\s+\d{1,2},\s+\d{4}.*$/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function itemSummary(content) {
  const withoutHeader = content.replace(/^\s*\d{6}\s+\[[\s\S]*?\]\s*/, "");
  const clerkEnd = withoutHeader.indexOf("(Clerk of the Board)");
  return normalizeWhitespace(withoutHeader.slice(0, clerkEnd >= 0 ? clerkEnd : 3000)).slice(0, 3500);
}

function pageAtOffset(pageOffsets, offset) {
  let page = pageOffsets[0]?.page ?? 1;
  for (const entry of pageOffsets) {
    if (entry.offset > offset) break;
    page = entry.page;
  }
  return page;
}

function parseRollCalls(content) {
  const lines = content.split("\n");
  const rollCalls = [];
  let previousGroupEnd = -1;
  let index = 0;

  while (index < lines.length) {
    const firstLabel = parseVoteLabel(lines[index]);
    if (!firstLabel) {
      index += 1;
      continue;
    }

    const action = normalizeWhitespace(lines.slice(previousGroupEnd + 1, index).join(" "))
      .slice(-1200);
    const rollCall = {
      sequence: rollCalls.length + 1,
      action,
      ayes: [],
      noes: [],
      absent: [],
      excused: [],
    };

    while (index < lines.length) {
      const label = parseVoteLabel(lines[index]);
      if (!label) break;

      let namesText = label.names;
      let cursor = index + 1;
      while (splitNames(namesText).length < label.count && cursor < lines.length) {
        if (parseVoteLabel(lines[cursor])) break;
        if (/^\s*\d{6}\s+\[/.test(lines[cursor])) break;
        if (!isPageFurniture(lines[cursor])) namesText += `, ${lines[cursor].trim()}`;
        cursor += 1;
      }

      rollCall[label.key] = splitNames(namesText).slice(0, label.count);
      index = cursor;
    }

    previousGroupEnd = index - 1;
    rollCalls.push(rollCall);
  }

  return rollCalls;
}

function parseVoteLabel(line) {
  const match = line.match(/^\s*(Ayes|Noes|Absent|Excused):\s*(\d+)\s*-\s*(.*)$/i);
  if (!match) return null;
  return {
    key: match[1].toLowerCase(),
    count: Number(match[2]),
    names: match[3],
  };
}

function splitNames(value) {
  return value
    .split(",")
    .map((name) => name.replace(/\s+/g, " ").replace(/[.;]+$/, "").trim())
    .filter(Boolean);
}

function isPageFurniture(line) {
  return /^(?:Board of Supervisors|City and County of San Francisco|\s*Page \d+|\s*Printed at)/i.test(line.trim());
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
