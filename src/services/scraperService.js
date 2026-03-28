import { withClient } from "../db.js";
import { config } from "../config.js";
import {
  getExamById,
  getExistingNormalizedTitles,
  insertDiscovery,
  markExamFailed,
  markExamQueued,
  updateExamPdf
} from "../repositories/examRepository.js";
import { clearOldLogs, insertScraperLog } from "../repositories/scraperLogRepository.js";
import { scrapeHomepage } from "./homepageScraper.js";
import { extractOfficialPdf } from "./detailPageScraper.js";

async function persistLog(client, level, eventName, message, metadata = {}) {
  await insertScraperLog(client, {
    level,
    eventName,
    message,
    metadata
  });
}

export async function runScraper({ browser, queue, logger }) {
  logger.info("Scraper started");

  await withClient(async (client) => {
    await clearOldLogs(client, config.scraperLogRetentionDays);
    await persistLog(client, "info", "scraper_started", "Scraper started");
  });

  let homepageJobs = [];

  try {
    homepageJobs = await scrapeHomepage(browser, logger);

    logger.info({ count: homepageJobs.length }, "Homepage loaded");

    await withClient(async (client) => {
      await persistLog(client, "info", "homepage_loaded", "Homepage loaded", {
        jobsFoundCount: homepageJobs.length
      });
    });
  } catch (error) {
    logger.error({ err: error.message }, "Homepage scrape failed");

    await withClient(async (client) => {
      await persistLog(client, "error", "homepage_failed", "Homepage scrape failed", {
        error: error.message
      });
    });

    throw error;
  }

  const normalizedTitles = homepageJobs.map((job) => job.normalizedTitle);
  const existingTitles = await withClient((client) => getExistingNormalizedTitles(client, normalizedTitles));
  const newDiscoveries = homepageJobs.filter((job) => !existingTitles.has(job.normalizedTitle));

  logger.info(
    { jobsFoundCount: homepageJobs.length, newDiscoveriesCount: newDiscoveries.length },
    "Homepage jobs compared with database"
  );

  await withClient(async (client) => {
    await persistLog(client, "info", "jobs_compared", "Homepage jobs compared", {
      jobsFoundCount: homepageJobs.length,
      newDiscoveriesCount: newDiscoveries.length
    });
  });

  for (const discovery of newDiscoveries) {
    let examRecord;

    try {
      examRecord = await withClient((client) =>
        insertDiscovery(client, {
          title: discovery.title,
          normalizedTitle: discovery.normalizedTitle,
          portalUrl: discovery.portalUrl,
          discoveredAt: new Date().toISOString()
        })
      );

      logger.info(
        { title: discovery.title, portalUrl: discovery.portalUrl },
        "Detail page visited"
      );

      await withClient(async (client) => {
        await persistLog(client, "info", "detail_page_visited", "Detail page visited", {
          title: discovery.title,
          portalUrl: discovery.portalUrl
        });
      });

      const officialPdfUrl = await extractOfficialPdf(browser, discovery.portalUrl, logger);

      await withClient((client) => updateExamPdf(client, examRecord.id, officialPdfUrl, "PDF_EXTRACTED"));

      logger.info(
        { title: discovery.title, officialPdfUrl },
        "PDF extracted"
      );

      await withClient(async (client) => {
        await persistLog(client, "info", "pdf_extracted", "PDF extracted", {
          title: discovery.title,
          officialPdfUrl
        });
      });

      const latestExam = await withClient((client) => getExamById(client, examRecord.id));

      if (!latestExam || latestExam.queued_at) {
        continue;
      }

      const jobPayload = {
        exam_id: latestExam.id,
        normalized_title: latestExam.normalized_title,
        title: latestExam.title,
        official_pdf_url: officialPdfUrl,
        portal_url: latestExam.portal_url,
        discovered_at: latestExam.discovered_at
      };

      await queue.add("process-official-pdf", jobPayload, {
        jobId: latestExam.normalized_title
      });

      const queuedExam = await withClient((client) => markExamQueued(client, latestExam.id));
      if (!queuedExam) {
        continue;
      }

      logger.info(
        { title: latestExam.title, queueName: queue.name },
        "Job pushed to queue"
      );

      await withClient(async (client) => {
        await persistLog(client, "info", "job_queued", "Job pushed to queue", {
          title: latestExam.title,
          queueName: queue.name
        });
      });
    } catch (error) {
      logger.error(
        { title: discovery.title, err: error.message },
        "Discovery processing failed"
      );

      if (examRecord?.id) {
        await withClient((client) => markExamFailed(client, examRecord.id, "FAILED"));
      }

      await withClient(async (client) => {
        await persistLog(client, "error", "discovery_failed", "Discovery processing failed", {
          title: discovery.title,
          portalUrl: discovery.portalUrl,
          error: error.message
        });
      });
    }
  }
}
