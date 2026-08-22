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

CREATE TABLE IF NOT EXISTS legislative_items (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  file_number text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  matter text NOT NULL,
  context text NOT NULL,
  start_page integer NOT NULL CHECK (start_page > 0),
  end_page integer NOT NULL CHECK (end_page >= start_page),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(context, '')), 'C')
  ) STORED,
  UNIQUE (document_id, ordinal)
);

CREATE INDEX IF NOT EXISTS legislative_items_search_vector_idx
  ON legislative_items USING gin (search_vector);

CREATE INDEX IF NOT EXISTS legislative_items_file_number_idx
  ON legislative_items (file_number);

CREATE INDEX IF NOT EXISTS legislative_items_document_id_idx
  ON legislative_items (document_id);

CREATE TABLE IF NOT EXISTS roll_calls (
  id bigserial PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES legislative_items(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  action text NOT NULL,
  ayes text[] NOT NULL DEFAULT '{}',
  noes text[] NOT NULL DEFAULT '{}',
  absent text[] NOT NULL DEFAULT '{}',
  excused text[] NOT NULL DEFAULT '{}',
  UNIQUE (item_id, sequence)
);

CREATE INDEX IF NOT EXISTS roll_calls_item_id_idx
  ON roll_calls (item_id);

COMMENT ON TABLE legislative_items IS
  'Legislative file blocks parsed from official Board meeting minutes.';

COMMENT ON TABLE roll_calls IS
  'Recorded roll calls with the immediately preceding action text preserved for interpretation.';
