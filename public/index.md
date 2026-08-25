# SF BOS Search

sfbos.info is an independent full-text index of San Francisco Board of Supervisors agendas and minutes from 2012 onward, with available official-source catalog records reaching back to 1996. The legacy City catalog has known gaps from 2003 through 2005.

## Ask a question with the archive

1. Send the complete question to `https://sfbos.info/api/query.md?q={URL_ENCODED_QUESTION}`.
2. Use the returned legislative files, roll calls, extracted facts, transcript anchors, and official City sources as an evidence bundle.
3. Read the action attached to every roll call; an Aye or No has no meaning without it.
4. Use the specialized endpoints below when explicit filters or exhaustive follow-up searches are needed.
5. Follow the result's page-addressable evidence, then open the official City source and verify decisive claims before answering.

## API

`GET /api/query`

Parameters: `q`, `format`.

Request Markdown with `/api/query.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/search`

Parameters: `q`, `year`, `kind`, `mode`, `limit`, `format`.

Request Markdown with `/api/search.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/items`

Parameters: `q`, `voter`, `position`, `final`, `groupBy`, `from`, `to`, `limit`, `format`.

Request Markdown with `/api/items.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/comments`

Parameters: `q`, `speaker`, `from`, `to`, `limit`, `format`.

Request Markdown with `/api/comments.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/aggregates/votes`

Parameters: `voter`, `position`, `from`, `to`, `final`, `groupBy`, `limit`.

`GET /api/aggregates/housing`

Parameters: `voter`, `position`, `from`, `to`, `final`, `limit`. The response states its unit-selection rule and interpretation cautions.

Bulk interfaces: `/api/snapshots`, `/api/changes`, and `/api/quality`.

MCP Streamable HTTP: `POST /api/mcp`.

Human-readable reconciled supervisor profiles: `/supervisors`.

Search responses provide `markdownUrl` for a focused Markdown excerpt, `transcriptUrl` for canonical HTML evidence, and `officialUrl` for the authoritative San Francisco government PDF. Legislative-item transcript links target the exact structured-record row. Other results target the matching page. Document transcripts accept page ranges of up to 50 pages using `?pages=5-7`.
