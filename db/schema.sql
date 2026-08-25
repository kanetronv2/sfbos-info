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

DROP INDEX IF EXISTS legislative_items_search_vector_idx;

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

CREATE INDEX IF NOT EXISTS legislative_items_title_trgm_idx
  ON legislative_items USING gin (lower(title) gin_trgm_ops);

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

CREATE INDEX IF NOT EXISTS public_comments_speaker_trgm_idx
  ON public_comments USING gin (lower(speaker) gin_trgm_ops);

COMMENT ON TABLE public_comments IS
  'Speaker-level public-comment summaries parsed from official Board meeting minutes.';

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  statistics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

CREATE TABLE IF NOT EXISTS parser_runs (
  id bigserial PRIMARY KEY,
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  config_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  statistics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

CREATE TABLE IF NOT EXISTS legistar_events (
  event_id bigint PRIMARY KEY,
  event_guid uuid,
  event_date date,
  body_name text,
  location text,
  status text,
  agenda_url text,
  minutes_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legistar_matters (
  matter_id bigint PRIMARY KEY,
  matter_guid uuid,
  file_number text NOT NULL,
  name text,
  title text,
  matter_type text,
  status text,
  introduced_date date,
  final_action_date date,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legistar_matters_file_number_idx
  ON legistar_matters (file_number);

CREATE TABLE IF NOT EXISTS document_identifiers (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  scheme text NOT NULL,
  value text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source text NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme, value, document_id)
);

CREATE INDEX IF NOT EXISTS document_identifiers_document_idx
  ON document_identifiers (document_id);

CREATE TABLE IF NOT EXISTS legislative_files (
  id bigserial PRIMARY KEY,
  file_number text NOT NULL UNIQUE,
  legistar_matter_id bigint REFERENCES legistar_matters(matter_id) ON DELETE SET NULL,
  canonical_title text,
  first_seen_date date,
  last_seen_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE legislative_files ADD COLUMN IF NOT EXISTS last_legistar_checked_at timestamptz;

ALTER TABLE legislative_items ADD COLUMN IF NOT EXISTS legislative_file_id bigint
  REFERENCES legislative_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS legislative_items_legislative_file_idx
  ON legislative_items (legislative_file_id);

CREATE TABLE IF NOT EXISTS supervisors (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  family_name text NOT NULL,
  district text,
  term_start date,
  term_end date,
  legistar_person_id bigint,
  active boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supervisor_aliases (
  id bigserial PRIMARY KEY,
  supervisor_id bigint NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL UNIQUE,
  source text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1)
);

CREATE TABLE IF NOT EXISTS roll_call_positions (
  id bigserial PRIMARY KEY,
  roll_call_id bigint NOT NULL REFERENCES roll_calls(id) ON DELETE CASCADE,
  supervisor_id bigint REFERENCES supervisors(id) ON DELETE SET NULL,
  recorded_name text NOT NULL,
  position text NOT NULL CHECK (position IN ('aye', 'no', 'absent', 'excused')),
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source text NOT NULL,
  UNIQUE (roll_call_id, recorded_name, position)
);

CREATE INDEX IF NOT EXISTS roll_call_positions_supervisor_idx
  ON roll_call_positions (supervisor_id, position);

CREATE TABLE IF NOT EXISTS evidence_spans (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field_name text NOT NULL,
  value_text text NOT NULL,
  start_offset integer,
  end_offset integer,
  quote text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  parser_run_id bigint REFERENCES parser_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, page_number, entity_type, entity_id, field_name, value_text)
);

CREATE INDEX IF NOT EXISTS evidence_spans_entity_idx
  ON evidence_spans (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS evidence_spans_confidence_idx
  ON evidence_spans (confidence);

CREATE TABLE IF NOT EXISTS document_versions (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  content_sha256 text NOT NULL,
  source_etag text,
  source_last_modified timestamptz,
  page_count integer NOT NULL,
  parser_run_id bigint REFERENCES parser_runs(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number),
  UNIQUE (document_id, content_sha256)
);

CREATE TABLE IF NOT EXISTS document_version_pages (
  version_id bigint NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  content_sha256 text NOT NULL,
  content text NOT NULL,
  PRIMARY KEY (version_id, page_number)
);

CREATE TABLE IF NOT EXISTS change_log (
  id bigserial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('create', 'update', 'delete')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  version text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS change_log_cursor_idx
  ON change_log (id);

CREATE INDEX IF NOT EXISTS change_log_changed_at_idx
  ON change_log (changed_at DESC);

CREATE TABLE IF NOT EXISTS semantic_embeddings (
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0),
  embedding double precision[] NOT NULL,
  content_sha256 text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_key, model)
);

CREATE TABLE IF NOT EXISTS search_entities (
  id bigserial PRIMARY KEY,
  legislative_item_id bigint NOT NULL REFERENCES legislative_items(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN (
    'address', 'amount', 'party', 'person', 'department', 'housing-units', 'file-number', 'topic'
  )),
  normalized_value text NOT NULL,
  display_value text NOT NULL,
  numeric_value numeric,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  parser_version text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(display_value, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(normalized_value, '')), 'B')
  ) STORED,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legislative_item_id, entity_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS search_entities_vector_idx
  ON search_entities USING gin (search_vector);

CREATE INDEX IF NOT EXISTS search_entities_value_trgm_idx
  ON search_entities USING gin (normalized_value gin_trgm_ops);

CREATE INDEX IF NOT EXISTS search_entities_item_idx
  ON search_entities (legislative_item_id);

COMMENT ON TABLE evidence_spans IS
  'Compact page-addressable parser evidence with extraction confidence and parser provenance. Per-voter confidence is stored on normalized roll-call positions.';

COMMENT ON TABLE document_version_pages IS
  'Sparse changed-page archive. The current version reads from pages; older versions store only pages needed to reconstruct a diff.';

COMMENT ON TABLE change_log IS
  'Append-only public change feed for reconciled entities and document versions.';

COMMENT ON TABLE search_entities IS
  'Versioned searchable entities extracted from legislative records for field-aware retrieval.';
