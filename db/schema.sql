CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS documents (
  id bigserial PRIMARY KEY,
  meeting_date date NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2012 AND 2100),
  kind text NOT NULL CHECK (kind IN ('agenda', 'minutes')),
  title text NOT NULL,
  official_url text NOT NULL UNIQUE,
  local_path text,
  event_id bigint,
  event_guid uuid,
  page_count integer NOT NULL DEFAULT 0,
  indexed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_meeting_date_idx
  ON documents (meeting_date DESC);

CREATE INDEX IF NOT EXISTS documents_year_kind_idx
  ON documents (year, kind);

CREATE TABLE IF NOT EXISTS pages (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  content text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED,
  UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS pages_search_vector_idx
  ON pages USING gin (search_vector);

CREATE INDEX IF NOT EXISTS pages_document_id_idx
  ON pages (document_id);

COMMENT ON TABLE documents IS
  'Official San Francisco Board of Supervisors agenda and minutes PDFs.';

COMMENT ON TABLE pages IS
  'Page-level text extracted from documents with pdftotext.';
