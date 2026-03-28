CREATE TABLE IF NOT EXISTS discovered_exams (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL UNIQUE,
    portal_url TEXT NOT NULL,
    official_pdf_url TEXT,
    json_data JSONB,
    status TEXT NOT NULL DEFAULT 'PENDING',
    discovery_status TEXT NOT NULL DEFAULT 'NEW_DISCOVERY',
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queued_at TIMESTAMPTZ,
    last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discovered_exams_discovery_status_idx
    ON discovered_exams (discovery_status);

CREATE INDEX IF NOT EXISTS discovered_exams_status_idx
    ON discovered_exams (status);

CREATE TABLE IF NOT EXISTS scraper_logs (
    id BIGSERIAL PRIMARY KEY,
    level VARCHAR(16) NOT NULL,
    event_name TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_knowledge_chunks (
    id BIGSERIAL PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES discovered_exams(id) ON DELETE CASCADE,
    chunk_content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    token_count INTEGER NOT NULL,
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX IF NOT EXISTS exam_knowledge_chunks_exam_id_idx
    ON exam_knowledge_chunks (exam_id);
