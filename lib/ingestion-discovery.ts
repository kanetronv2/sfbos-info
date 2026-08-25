export type OfficialDocumentCandidate = {
  sourceKey: string;
  source: "legistar-calendar" | "board-archive";
  meetingDate: string;
  kind: "agenda" | "minutes";
  officialUrl: string;
  eventId: number | null;
  eventGuid: string | null;
  contentLength: number | null;
  etag: string | null;
  lastModified: string | null;
};

const calendarUrl = "https://sfgov.legistar.com/Calendar.aspx";
const archiveUrl = "https://sfbos.archive.sf.gov/meetings/full-board-meetings";
const userAgent = "sfbos.info automatic public-record discovery/1.0";

export async function discoverOfficialDocuments(now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const earliestDate = `${currentYear - 1}-12-01`;
  const [calendar, archive] = await Promise.all([
    discoverLegistarCalendar(currentYear),
    discoverBoardArchive(),
  ]);

  const currentCalendar = calendar.filter((candidate) => candidate.meetingDate >= earliestDate);
  const calendarMeetingKeys = new Set(currentCalendar.map((candidate) => `${candidate.meetingDate}:${candidate.kind}`));
  const candidates = new Map(currentCalendar.map((candidate) => [candidate.sourceKey, candidate]));
  for (const candidate of archive) {
    if (candidate.meetingDate < earliestDate) continue;
    if (calendarMeetingKeys.has(`${candidate.meetingDate}:${candidate.kind}`)) continue;
    candidates.set(candidate.sourceKey, candidate);
  }

  return concurrentMap([...candidates.values()], 8, async (candidate) => ({
    ...candidate,
    ...await probePdf(candidate.officialUrl),
  }));
}

export async function discoverLegistarCalendar(year: number) {
  const initialResponse = await fetch(calendarUrl, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!initialResponse.ok) throw new Error(`Legistar calendar returned ${initialResponse.status}`);
  const initialHtml = await initialResponse.text();
  const form = extractFormFields(initialHtml);
  form.set("ctl00$ContentPlaceHolder1$lstYears", String(year));
  form.set("ctl00_ContentPlaceHolder1_lstYears_ClientState", JSON.stringify({
    logEntries: [],
    value: String(year),
    text: String(year),
    enabled: true,
    checkedIndices: [],
    checkedItemsTextOverflows: false,
  }));
  form.set("ctl00$ContentPlaceHolder1$btnSearch", "Search Calendar");

  const response = await fetch(calendarUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: form,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Legistar calendar search returned ${response.status}`);
  return parseLegistarCalendar(await response.text());
}

export function parseLegistarCalendar(html: string) {
  const candidates: Array<Omit<OfficialDocumentCandidate, "contentLength" | "etag" | "lastModified">> = [];
  for (const match of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const row = match[0];
    const text = decodeHtml(row.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!text.startsWith("Board of Supervisors ")) continue;
    const date = text.match(/Board of Supervisors\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const detail = row.match(/MeetingDetail\.aspx\?ID=(\d+)&(?:amp;)?GUID=([0-9a-f-]{36})/i);
    if (!date || !detail) continue;
    const meetingDate = `${date[3]}-${date[1].padStart(2, "0")}-${date[2].padStart(2, "0")}`;
    const eventId = Number(detail[1]);
    const eventGuid = detail[2].toUpperCase();

    for (const document of row.matchAll(/href="([^"]*View\.ashx\?M=([AM])&(?:amp;)?ID=(\d+)&(?:amp;)?GUID=([0-9a-f-]{36})[^"]*)"/gi)) {
      if (Number(document[3]) !== eventId) continue;
      const kind = document[2].toUpperCase() === "A" ? "agenda" : "minutes";
      const officialUrl = `https://sfgov.legistar.com/View.ashx?M=${kind === "agenda" ? "A" : "M"}&ID=${eventId}&GUID=${eventGuid}`;
      candidates.push({
        sourceKey: `legistar:${eventId}:${kind}`,
        source: "legistar-calendar",
        meetingDate,
        kind,
        officialUrl,
        eventId,
        eventGuid,
      });
    }
  }
  return deduplicate(candidates);
}

export async function discoverBoardArchive() {
  const response = await fetch(archiveUrl, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Board archive returned ${response.status}`);
  const html = await response.text();
  const candidates: Array<Omit<OfficialDocumentCandidate, "contentLength" | "etag" | "lastModified">> = [];
  for (const match of html.matchAll(/href=["']([^"']*bag(\d{2})(\d{2})(\d{2})_(agenda|minutes)\.pdf[^"']*)["']/gi)) {
    const year = Number(match[4]) >= 90 ? 1900 + Number(match[4]) : 2000 + Number(match[4]);
    const meetingDate = `${year}-${match[2]}-${match[3]}`;
    const kind = match[5].toLowerCase() as "agenda" | "minutes";
    const officialUrl = new URL(decodeHtml(match[1]), archiveUrl).toString();
    candidates.push({
      sourceKey: `archive:${meetingDate}:${kind}`,
      source: "board-archive",
      meetingDate,
      kind,
      officialUrl,
      eventId: null,
      eventGuid: null,
    });
  }
  return deduplicate(candidates);
}

function extractFormFields(html: string) {
  const form = new URLSearchParams();
  for (const match of html.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const name = decodeHtml(match[1]);
    const type = tag.match(/type="([^"]+)"/i)?.[1].toLowerCase();
    if (["submit", "image", "button"].includes(type ?? "")) continue;
    form.set(name, decodeHtml(tag.match(/value="([^"]*)"/i)?.[1] ?? ""));
  }
  return form;
}

async function probePdf(url: string) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("pdf")) {
      throw new Error(`Official PDF probe returned ${response.status}`);
    }
    return {
      contentLength: numberOrNull(response.headers.get("content-length")),
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  } catch {
    return { contentLength: null, etag: null, lastModified: null };
  }
}

function numberOrNull(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function deduplicate<T extends { sourceKey: string }>(records: T[]) {
  return [...new Map(records.map((record) => [record.sourceKey, record])).values()];
}

async function concurrentMap<T, R>(records: T[], concurrency: number, task: (record: T) => Promise<R>) {
  const output: R[] = new Array(records.length);
  let cursor = 0;
  async function worker() {
    while (cursor < records.length) {
      const index = cursor++;
      output[index] = await task(records[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, records.length) }, worker));
  return output;
}
