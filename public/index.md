# SF BOS Search

sfbos.info is an independent full-text index of San Francisco Board of Supervisors agendas and minutes from 2012 onward.

## Ask a question with the archive

1. Send the complete question to `https://sfbos.info/api/query.md?q={URL_ENCODED_QUESTION}`.
2. Use the returned legislative files, roll calls, extracted facts, transcript anchors, and official PDFs as an evidence bundle.
3. Read the action attached to every roll call; an Aye or No has no meaning without it.
4. Use the specialized endpoints below when explicit filters or exhaustive follow-up searches are needed.
5. Follow the result's page-addressable evidence, then open the official PDF and verify decisive claims before answering.

## API

`GET /api/query`

Parameters: `q`, `format`.

Request Markdown with `/api/query.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/search`

Parameters: `q`, `year`, `kind`, `limit`, `format`.

Request Markdown with `/api/search.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/items`

Parameters: `q`, `voter`, `position`, `final`, `groupBy`, `from`, `to`, `limit`, `format`.

Request Markdown with `/api/items.md`, `?format=md`, or `Accept: text/markdown`.

`GET /api/comments`

Parameters: `q`, `speaker`, `from`, `to`, `limit`, `format`.

Request Markdown with `/api/comments.md`, `?format=md`, or `Accept: text/markdown`.

Search responses provide `transcriptUrl` for canonical HTML evidence and `officialUrl` for the authoritative San Francisco government PDF. Document transcripts advertise Markdown alternatives and accept page ranges of up to 50 pages using `?pages=5-7`.
