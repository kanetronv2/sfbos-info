# sfbos.info

Minimal full-text search for San Francisco Board of Supervisors agendas and minutes, with official source links and JSON/Markdown APIs.

## Local development

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, the application uses a small preview index so the interface and API remain testable.

## Production index

Provision a Neon Postgres integration in Vercel and copy `.env.example` to `.env.local` with the injected connection string. Then run:

```bash
npm run db:migrate
npm run db:ingest
```

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
