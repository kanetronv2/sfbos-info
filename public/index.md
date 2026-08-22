# SF BOS Search

sfbos.info is an independent full-text index of San Francisco Board of Supervisors agendas and minutes from 2012 onward.

## Ask a question with the archive

1. For vote questions, request `https://sfbos.info/api/items.md?q={query}`.
2. Add `voter`, `position`, `from`, `to`, and `limit` parameters when useful.
3. Read the action attached to every roll call; an Aye or No has no meaning without it.
4. Use `https://sfbos.info/api/search.md?q={query}` for broad page-level discovery.
5. Open the official PDF links and verify the final action before answering.

## API

`GET /api/search`

Parameters: `q`, `year`, `kind`, `limit`, `format`.

Request Markdown with `/api/search.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/items`

Parameters: `q`, `voter`, `position`, `from`, `to`, `limit`, `format`.

Request Markdown with `/api/items.md`, `?format=md`, or `Accept: text/markdown`.

All search result links point to official San Francisco government documents.
