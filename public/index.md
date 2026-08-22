# SF BOS Search

sfbos.info is an independent full-text index of San Francisco Board of Supervisors agendas and minutes from 2012 onward.

## Ask a question with the archive

1. Turn the question into a focused search query.
2. Request `https://sfbos.info/api/search.md?q={query}`.
3. Add `year`, `kind`, and `limit` parameters when useful.
4. Read the matching passages and open the official PDF links.
5. Verify whether a passage describes a proposal, discussion, amendment, or final vote before answering.

## API

`GET /api/search`

Parameters: `q`, `year`, `kind`, `limit`, `format`.

Request Markdown with `/api/search.md`, `?format=md`, or `Accept: text/markdown`.

All search result links point to official San Francisco government documents.
