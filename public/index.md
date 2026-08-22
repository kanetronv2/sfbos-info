# SF BOS Search

sfbos.info is an independent full-text index of San Francisco Board of Supervisors agendas and minutes from 2012 onward.

## Ask a question with the archive

1. For vote questions, request `https://sfbos.info/api/items.md?q={query}`.
2. Add `voter`, `position`, `final`, `groupBy`, `from`, `to`, and `limit` parameters when useful.
3. Read the action attached to every roll call; an Aye or No has no meaning without it.
4. Use `https://sfbos.info/api/search.md?q={query}` for broad page-level discovery.
5. Use `https://sfbos.info/api/comments.md?q={query}` for individual public-comment summaries.
6. Follow the result's page-addressable HTML evidence, then open the official PDF and verify the final action before answering.

## API

`GET /api/search`

Parameters: `q`, `year`, `kind`, `limit`, `format`.

Request Markdown with `/api/search.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/items`

Parameters: `q`, `voter`, `position`, `final`, `groupBy`, `from`, `to`, `limit`, `format`.

Request Markdown with `/api/items.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/comments`

Parameters: `q`, `speaker`, `from`, `to`, `limit`, `format`.

Request Markdown with `/api/comments.md`, `?format=md`, or `Accept: text/markdown`.

Search responses provide `transcriptUrl` for canonical HTML evidence and `officialUrl` for the authoritative San Francisco government PDF.
