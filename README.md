# Sarkari Result Scraper

Node.js service that monitors the Sarkari Result homepage, detects new job postings, extracts official notification PDFs from detail pages, and pushes discovered jobs to a BullMQ queue backed by Supabase Postgres and Supabase Storage.

## Features

- Playwright homepage and detail-page scraping with retries
- PostgreSQL-backed idempotency using a unique normalized title
- BullMQ queue publishing for downstream PDF processing
- Supabase Storage uploads for internal PDF hosting
- Cron scheduling via `node-cron`
- Structured logging with Pino
- Failure logging to `scraper_logs`
- PDF validation with HTTP status and `.pdf` checks

## Setup

1. Copy `.env.example` to `.env` and fill in Supabase Postgres, Redis, and Supabase Storage credentials.
2. Create the database tables:

```sql
\i sql/schema.sql
```

3. Install dependencies:

```bash
npm install
npx playwright install chromium
```

## Run

Run once:

```bash
npm run run-once
```

Run on schedule:

```bash
npm start
```

Run the BullMQ worker example:

```bash
npm run worker
```

## Flow

`Scheduler -> Homepage Scrape -> DB Compare -> New Discovery -> Detail Page -> Official PDF -> BullMQ -> Supabase Storage`

## Tables

- `discovered_exams`: stores discovered jobs and queue state
- `scraper_logs`: stores scraper events and failures

## Supabase Notes

- Use your Supabase Postgres connection string in `DATABASE_URL`.
- Percent-encode the password in `DATABASE_URL` if it contains special characters such as `@`, `:`, `/`, or `#`.
- Create the `exam-notifications` bucket, or the bucket named in `STORAGE_BUCKET_NAME`, and set it to `Public`.
