# sfbos.info

Minimal full-text search for San Francisco Board of Supervisors agendas and minutes, with indexable HTML text views, official source links, and JSON/Markdown APIs.

## Local development

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, the application uses a small preview index so the interface and API remain testable.

## Download the public archive

The PDF corpus is intentionally excluded from Git and Vercel deployments. Rebuild it locally from the official sources:

```bash
./scripts/download-historical-full-board-meetings.sh
./scripts/download-full-board-meetings.sh
```

Files are organized under `data/full-board-meetings/{agendas,minutes}/{year}`.

## Production index

Provision a Neon Postgres integration in Vercel and copy `.env.example` to `.env.local` with the injected connection string. Then run:

```bash
npm run db:migrate
npm run db:ingest
npm run db:items
npm run db:comments
```

Both database commands load `.env.local` automatically.

Audit all local files and their official-source URL mapping without connecting to a database:

```bash
npm run db:ingest -- --dry-run
```

The ingester uses `pdftotext`, indexes every non-empty PDF page, and records the official Legistar or SF archive URL. It is resumable; use `--force` to re-index existing documents or limit a run with `--from-year`, `--to-year`, and `--limit`:

```bash
npm run db:ingest -- --from-year 2018 --to-year 2018 --limit 10
```

`npm run db:items` parses the indexed minutes into legislative-file blocks and action-aware roll
calls. `npm run db:comments` builds a speaker-level index of the clerk's public-comment summaries.
Both read from Postgres, are resumable, and accept the same year, limit, force, and dry-run options.

## API

- `GET /api/query.md?q=How+many+housing+units+has+Connie+Chan+voted+against%3F`
- `GET /api/search?q=affordable+housing`
- `GET /api/search.md?q=housing+vote&year=2018`
- `GET /api/items?q=dwelling+units&voter=Chan&position=no&from=2021&to=2026`
- `GET /api/items.md?q=469+Stevenson&voter=Chan`
- `GET /api/items.md?q=killer+robots&final=true&groupBy=file`
- `GET /api/comments.md?q=Great+Highway&from=2021&to=2021`
- `GET /openapi.yaml`
- `GET /llms.txt`

Natural-language evidence search federates the specialized indexes into one answer-engine-friendly
response. Page search supports `year`, `kind`, and `limit`. Item search supports `voter`, `position`, `final`,
`groupBy`, `from`, `to`, and `limit`; it returns typed actions and extracted amounts, housing-unit
counts, addresses, and agreement parties. Comment search supports `speaker`, `from`, `to`, and `limit`. All APIs
expand common civic-language aliases and can return Markdown using the `.md` route, `?format=md`, or
`Accept: text/markdown`.

Every indexed PDF also has a canonical HTML evidence page at `/documents/{id}/{date}-{kind}`. Search
results link to the matching `#page-{number}` anchor and retain the official PDF as a separate source.
Append `.md` to the evidence-page URL for a Markdown transcript, optionally limited with `?pages=5-7`.

## Deploy on Vercel

1. Import this GitHub repository into Vercel with the Next.js defaults.
2. Add a Neon integration or set `DATABASE_URL` in the Vercel project.
3. Set `NEXT_PUBLIC_SITE_URL` to the production origin.
4. From a machine containing the downloaded corpus, run `npm run db:migrate`, `npm run db:ingest`, `npm run db:items`, and `npm run db:comments` against the production database.

Pushes to the repository's production branch can then be used for automatic deployments.
