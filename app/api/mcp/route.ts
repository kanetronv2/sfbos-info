import { neon } from "@neondatabase/serverless";
import { aggregateHousing, aggregateRecordedVotes } from "@/lib/aggregates";
import { getDocumentEvidence } from "@/lib/documents";
import { searchLegislativeItems } from "@/lib/item-search";
import { searchDocuments } from "@/lib/search";

export const runtime = "nodejs";
const protocolVersion = "2025-06-18";

const tools = [
  {
    name: "search_board_records", title: "Search Board records",
    description: "Search page-level agenda and minutes text. Returns HTML evidence, focused Markdown, and official City source URLs.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, year: { type: "integer", minimum: 1996 }, kind: { type: "string", enum: ["agenda", "minutes"] }, mode: { type: "string", enum: ["lexical", "hybrid"] }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["query"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "search_legislative_actions", title: "Search legislative actions",
    description: "Search parsed legislative files and attached roll calls. Recorded positions apply to actions, not automatically to the underlying policy.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, voter: { type: "string" }, position: { type: "string", enum: ["aye", "no", "absent", "excused"] }, fromYear: { type: "integer", minimum: 1996 }, toYear: { type: "integer", minimum: 1996 }, finalOnly: { type: "boolean" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["query"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_document_evidence", title: "Get document evidence",
    description: "Get exact extracted pages and source metadata for a document ID.",
    inputSchema: { type: "object", properties: { documentId: { type: "string", pattern: "^[0-9]+$" }, startPage: { type: "integer", minimum: 1 }, endPage: { type: "integer", minimum: 1 } }, required: ["documentId"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "aggregate_recorded_votes", title: "Aggregate recorded votes",
    description: "Deterministically count a reconciled supervisor's recorded positions, grouped by legislative file or roll call.",
    inputSchema: aggregateSchema(false), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "aggregate_housing_units", title: "Aggregate housing-unit mentions",
    description: "Return housing-related recorded actions, addresses, unit mentions, and a deterministic count with explicit caveats.",
    inputSchema: aggregateSchema(true), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_change_feed", title: "Get change feed",
    description: "Read the append-only feed of document, supervisor, and legislative-file changes after a numeric cursor.",
    inputSchema: { type: "object", properties: { cursor: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 500 } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigin(origin)) return new Response("Forbidden origin", { status: 403 });
  const suppliedVersion = request.headers.get("mcp-protocol-version");
  if (suppliedVersion && ![protocolVersion, "2025-03-26"].includes(suppliedVersion)) {
    return new Response("Unsupported MCP-Protocol-Version", { status: 400 });
  }
  let message: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
  try { message = await request.json(); } catch { return rpcError(null, -32700, "Parse error"); }
  if (Array.isArray(message) || message.jsonrpc !== "2.0" || !message.method) return rpcError(message?.id ?? null, -32600, "Invalid Request");
  if (message.method.startsWith("notifications/")) return new Response(null, { status: 202, headers: mcpHeaders() });
  if (message.method === "initialize") {
    return rpcResult(message.id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "sfbos.info", title: "SF Board of Supervisors public records", version: "2.0.0" },
      instructions: "Use search tools to locate evidence, then cite transcriptUrl and verify decisive claims with officialUrl. A recorded Aye or No applies to its attached action and is not automatically a stance on the underlying matter.",
    });
  }
  if (message.method === "ping") return rpcResult(message.id, {});
  if (message.method === "tools/list") return rpcResult(message.id, { tools });
  if (message.method === "tools/call") {
    const name = String(message.params?.name ?? "");
    const input = isObject(message.params?.arguments) ? message.params?.arguments as Record<string, unknown> : {};
    if (!tools.some((tool) => tool.name === name)) return rpcError(message.id, -32602, `Unknown tool: ${name}`);
    try {
      const structuredContent = await callTool(name, input);
      return rpcResult(message.id, {
        content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
        isError: false,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Tool failed";
      return rpcResult(message.id, { content: [{ type: "text", text }], isError: true });
    }
  }
  return rpcError(message.id, -32601, "Method not found");
}

export async function GET() { return new Response("This stateless MCP endpoint accepts POST requests.", { status: 405, headers: { ...mcpHeaders(), Allow: "POST" } }); }
export async function DELETE() { return new Response(null, { status: 405, headers: { ...mcpHeaders(), Allow: "POST" } }); }
export async function OPTIONS() { return new Response(null, { status: 204, headers: { ...mcpHeaders(), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version" } }); }

async function callTool(name: string, input: Record<string, unknown>) {
  if (name === "search_board_records") {
    const query = requiredString(input.query, "query", 2, 300);
    return searchDocuments({ query, year: optionalYear(input.year), kind: input.kind === "agenda" || input.kind === "minutes" ? input.kind : null, mode: input.mode === "hybrid" ? "hybrid" : "lexical", limit: boundedInt(input.limit, 20, 1, 50) });
  }
  if (name === "search_legislative_actions") {
    const query = requiredString(input.query, "query", 2, 300);
    const voter = typeof input.voter === "string" ? input.voter.trim() : null;
    const position = ["aye", "no", "absent", "excused"].includes(String(input.position)) ? input.position as "aye" | "no" | "absent" | "excused" : null;
    return searchLegislativeItems({ query, voter, voterKey: voter?.toLowerCase() ?? null, position, final: input.finalOnly === true, groupBy: "file", fromYear: optionalYear(input.fromYear) ?? 1996, toYear: optionalYear(input.toYear) ?? new Date().getUTCFullYear(), limit: boundedInt(input.limit, 20, 1, 50) });
  }
  if (name === "get_document_evidence") {
    const document = await getDocumentEvidence(requiredString(input.documentId, "documentId", 1, 30));
    if (!document) throw new Error("Document not found");
    const start = boundedInt(input.startPage, 1, 1, Math.max(1, document.pageCount));
    const end = boundedInt(input.endPage, Math.min(document.pageCount, start + 4), start, Math.min(document.pageCount, start + 19));
    return { ...document, pages: document.pages.filter((page) => page.pageNumber >= start && page.pageNumber <= end) };
  }
  if (name === "aggregate_recorded_votes" || name === "aggregate_housing_units") {
    const options = aggregateOptions(input);
    return name === "aggregate_housing_units" ? aggregateHousing(options) : aggregateRecordedVotes(options);
  }
  if (name === "get_change_feed") {
    if (!process.env.DATABASE_URL) throw new Error("Database unavailable");
    const cursor = boundedInt(input.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = boundedInt(input.limit, 100, 1, 500);
    const sql = neon(process.env.DATABASE_URL);
    const changes = await sql.query(`SELECT id::text AS cursor, entity_type AS "entityType", entity_key AS "entityKey", change_type AS "changeType", changed_at::text AS "changedAt", version, payload FROM change_log WHERE id > $1 ORDER BY id LIMIT $2`, [cursor, limit]);
    return { cursor, nextCursor: changes.length === limit ? Number(changes.at(-1)?.cursor) : null, changes };
  }
  throw new Error("Unknown tool");
}

function aggregateOptions(input: Record<string, unknown>) {
  const position = ["aye", "no", "absent", "excused"].includes(String(input.position)) ? input.position as "aye" | "no" | "absent" | "excused" : null;
  return { voter: requiredString(input.voter, "voter", 2, 100), position, fromYear: optionalYear(input.fromYear) ?? 1996, toYear: optionalYear(input.toYear) ?? new Date().getUTCFullYear(), finalOnly: input.finalOnly === true, groupBy: input.groupBy === "roll-call" ? "roll-call" as const : "file" as const, limit: boundedInt(input.limit, 100, 1, 1000) };
}

function aggregateSchema(housing: boolean) {
  return { type: "object", properties: { voter: { type: "string" }, position: { type: "string", enum: ["aye", "no", "absent", "excused"] }, fromYear: { type: "integer", minimum: 1996 }, toYear: { type: "integer", minimum: 1996 }, finalOnly: { type: "boolean" }, ...(!housing ? { groupBy: { type: "string", enum: ["file", "roll-call"] } } : {}), limit: { type: "integer", minimum: 1, maximum: 1000 } }, required: ["voter"] };
}
function requiredString(value: unknown, name: string, min: number, max: number) { if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new Error(`${name} must be ${min} to ${max} characters`); return value.trim(); }
function optionalYear(value: unknown) { if (value === undefined || value === null) return null; const year = Number(value); if (!Number.isInteger(year) || year < 1996 || year > 2100) throw new Error("year must be from 1996 through 2100"); return year; }
function boundedInt(value: unknown, fallback: number, min: number, max: number) { const number = value === undefined ? fallback : Number(value); if (!Number.isInteger(number) || number < min || number > max) throw new Error(`integer must be ${min} through ${max}`); return number; }
function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function allowedOrigin(origin: string) { try { const url = new URL(origin); return url.protocol === "https:" || ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "http:"); } catch { return false; } }
function mcpHeaders() { return { "Content-Type": "application/json; charset=utf-8", "MCP-Protocol-Version": protocolVersion, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }; }
function rpcResult(id: string | number | null | undefined, result: unknown) { return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: mcpHeaders() }); }
function rpcError(id: string | number | null | undefined, code: number, message: string) { return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: code === -32700 || code === -32600 ? 400 : 200, headers: mcpHeaders() }); }
