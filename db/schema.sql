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

ALTER TABLE documents ADD COLUMN IF NOT EXISTS public_comments_indexed_at timestamptz;

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

ALTER TABLE legislative_items ADD COLUMN IF NOT EXISTS direct_search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS legislative_items_direct_search_vector_idx
  ON legislative_items USING gin (direct_search_vector);

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

ALTER TABLE roll_calls ADD COLUMN IF NOT EXISTS action_type text
  GENERATED ALWAYS AS (
    CASE
      WHEN action ~ 'FINALLY PASSED' THEN 'final-passage'
      WHEN action ~ 'FIRST READING' THEN 'first-reading'
      WHEN action ~ '\mADOPTED\M' THEN 'adoption'
      WHEN action ~ '\mAPPROVED\M' THEN 'approval'
      WHEN action ~* '\mRESCIND' THEN 'rescission'
      WHEN action ~* '\mCONTINU' THEN 'continuance'
      WHEN action ~* '\mAMEND' THEN 'amendment'
      WHEN action ~* '\mREFER' THEN 'referral'
      WHEN action ~* '\mTABL' THEN 'tabling'
      WHEN action ~* '\m(REJECT|FAIL|DENI)' THEN 'rejection'
      ELSE 'other'
    END
  ) STORED;

ALTER TABLE roll_calls ADD COLUMN IF NOT EXISTS is_final boolean
  GENERATED ALWAYS AS (
    action !~ 'FIRST READING' AND action ~ '(FINALLY PASSED|\mADOPTED\M|\mAPPROVED\M)'
  ) STORED;

CREATE INDEX IF NOT EXISTS roll_calls_final_item_idx
  ON roll_calls (item_id) WHERE is_final;

COMMENT ON TABLE legislative_items IS
  'Legislative file blocks parsed from official Board meeting minutes.';

COMMENT ON TABLE roll_calls IS
  'Recorded roll calls with the immediately preceding action text preserved for interpretation.';

CREATE TABLE IF NOT EXISTS public_comments (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  speaker text NOT NULL,
  content text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(speaker, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED,
  UNIQUE (document_id, ordinal)
);

CREATE INDEX IF NOT EXISTS public_comments_search_vector_idx
  ON public_comments USING gin (search_vector);

CREATE INDEX IF NOT EXISTS public_comments_document_id_idx
  ON public_comments (document_id);

COMMENT ON TABLE public_comments IS
  'Speaker-level public-comment summaries parsed from official Board meeting minutes.';
