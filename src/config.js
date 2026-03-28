import dotenv from "dotenv";

dotenv.config();

function toBoolean(value, fallback = true) {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  appEnv: process.env.APP_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",
  scraperBaseUrl: process.env.SCRAPER_BASE_URL ?? "https://sarkariresult.com.cm",
  scraperSchedule: process.env.SCRAPER_SCHEDULE ?? "*/30 * * * *",
  navigationTimeoutMs: toNumber(process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS, 45000),
  homepageRetryCount: toNumber(process.env.HOMEPAGE_RETRY_COUNT, 3),
  detailRetryCount: toNumber(process.env.DETAIL_RETRY_COUNT, 2),
  pdfRequestTimeoutMs: toNumber(process.env.PDF_REQUEST_TIMEOUT_MS, 20000),
  playwrightHeadless: toBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  pdfQueueName: process.env.PDF_QUEUE_NAME ?? "pdf-processing-queue",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_KEY,
  storageBucketName: process.env.STORAGE_BUCKET_NAME ?? "exam-notifications",
  scraperLogRetentionDays: toNumber(process.env.SCRAPER_LOG_RETENTION_DAYS, 14),
  ocrLanguages: process.env.OCR_LANGUAGES ?? "eng+hin",
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
  workerMaxJobsPerRun: toNumber(process.env.WORKER_MAX_JOBS_PER_RUN, 1),
  apiPort: toNumber(process.env.API_PORT, 3001)
};

export function assertConfig() {
  const required = [
    "databaseUrl",
    "redisUrl",
    "supabaseUrl",
    "supabaseServiceKey",
    "storageBucketName",
    "geminiApiKey"
  ];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
