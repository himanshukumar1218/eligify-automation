import { assertConfig, config } from "./config.js";
import { logger } from "./logger.js";
import { pool } from "./db.js";
import { launchBrowser } from "./services/browser.js";
import { createPdfQueue } from "./queue.js";
import { runScraper } from "./services/scraperService.js";
import { startScheduler } from "./scheduler.js";
import { startApiServer } from "./apiServer.js";

async function bootstrap() {
  assertConfig();

  const browser = await launchBrowser();
  const queue = await createPdfQueue();
  const apiServer = startApiServer(logger);
  let isRunning = false;

  const executeRun = async () => {
    if (isRunning) {
      logger.warn("Skipping scraper run because the previous run is still active");
      return;
    }

    isRunning = true;

    try {
      await runScraper({ browser, queue, logger });
    } finally {
      isRunning = false;
    }
  };

  if (process.argv.includes("--run-once")) {
    try {
      await executeRun();
    } finally {
      apiServer.close();
      await queue.close();
      await browser.close();
      await pool.end();
    }

    return;
  }

  startScheduler(config.scraperSchedule, executeRun, logger);

  const shutdown = async () => {
    logger.info("Shutting down scraper");
    apiServer.close();
    await queue.close();
    await browser.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch(async (error) => {
  logger.error({ err: error.message }, "Scraper bootstrap failed");
  await pool.end().catch(() => {});
  process.exit(1);
});
