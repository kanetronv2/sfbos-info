# sfbos.info

Minimal full-text search for San Francisco Board of Supervisors agendas and minutes, with official source links and JSON/Markdown APIs.

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
calls. It reads from Postgres rather than the local PDFs, is resumable, and accepts the same year,
limit, force, and dry-run options.

## API

- `GET /api/search?q=affordable+housing`
- `GET /api/search.md?q=housing+vote&year=2018`
- `GET /api/items?q=dwelling+units&voter=Chan&position=no&from=2021&to=2026`
- `GET /api/items.md?q=469+Stevenson&voter=Chan`
- `GET /openapi.yaml`
- `GET /llms.txt`

Page search supports `year`, `kind`, and `limit`. Item search supports `voter`, `position`, `from`,
`to`, and `limit`, and returns the action attached to every roll call. Both APIs can return Markdown
using the `.md` route, `?format=md`, or `Accept: text/markdown`.

## Deploy on Vercel

1. Import this GitHub repository into Vercel with the Next.js defaults.
2. Add a Neon integration or set `DATABASE_URL` in the Vercel project.
3. Set `NEXT_PUBLIC_SITE_URL` to the production origin.
4. From a machine containing the downloaded corpus, run `npm run db:migrate`, `npm run db:ingest`, and `npm run db:items` against the production database.

Pushes to the repository's production branch can then be used for automatic deployments.
