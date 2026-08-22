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

## API

- `GET /api/search?q=affordable+housing`
- `GET /api/search.md?q=housing+vote&year=2018`
- `GET /openapi.yaml`
- `GET /llms.txt`

The API supports `year`, `kind`, and `limit` filters and can return Markdown using `/api/search.md`, `?format=md`, or `Accept: text/markdown`.

## Deploy on Vercel

1. Import this GitHub repository into Vercel with the Next.js defaults.
2. Add a Neon integration or set `DATABASE_URL` in the Vercel project.
3. Set `NEXT_PUBLIC_SITE_URL` to the production origin.
4. From a machine containing the downloaded corpus, run `npm run db:migrate` and `npm run db:ingest` against the production database.

Pushes to the repository's production branch can then be used for automatic deployments.
