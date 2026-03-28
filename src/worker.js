import { Worker } from "bullmq";
import { assertConfig, config } from "./config.js";
import { withClient } from "./db.js";
import { logger } from "./logger.js";
import { getExamForJob, updateExamJson } from "./repositories/examRepository.js";
import { bulkInsertChunks, deleteChunksByExamId } from "./repositories/chunkRepository.js";
import { clearOrphanedKnowledgeChunks } from "./repositories/scraperLogRepository.js";
import { extractExamData } from "./services/aiService.js";
import { createSemanticChunks } from "./services/chunkingService.js";
import { extractPdfText, terminateExtractionResources } from "./services/extractionService.js";
import { uploadPdfFromUrl } from "./services/storageService.js";
import { normalizeTitle } from "./utils/normalizeTitle.js";

assertConfig();

let jobsHandledThisRun = 0;
let shuttingDown = false;

function buildStorageFileName(job, exam) {
  const safeTitle = normalizeTitle(job.data.title || exam.title || String(exam.id));
  return `notifications/${safeTitle}-${exam.id}.pdf`;
}

async function stopWorker(worker, reason) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ reason, jobsHandledThisRun }, "Stopping worker after configured run limit");
  await terminateExtractionResources().catch(() => {});
  await worker.close();
  process.exit(0);
}

const worker = new Worker(
  config.pdfQueueName,
  async (job) => {
    logger.info({ jobId: job.id, payload: job.data }, "Received PDF processing job");

    const exam = await withClient(async (client) => {
      await clearOrphanedKnowledgeChunks(client);
      return getExamForJob(client, job.data);
    });

    if (!exam) {
      throw new Error(`Exam record not found for queued job ${job.id}`);
    }

    const { publicUrl: storedPdfUrl, buffer: pdfBuffer } = await uploadPdfFromUrl(
      job.data.official_pdf_url,
      buildStorageFileName(job, exam)
    );

    const extractedDocument = await extractPdfText(pdfBuffer);
    const chunks = createSemanticChunks(exam.id, extractedDocument);
    const parsedExamData = await extractExamData(chunks);

    await withClient(async (client) => {
      await deleteChunksByExamId(client, exam.id);
      await bulkInsertChunks(client, chunks);
      await updateExamJson(
        client,
        exam.id,
        {
          ...parsedExamData,
          metadata: {
            extraction_method: extractedDocument.method,
            chunk_count: chunks.length,
            stored_pdf_url: storedPdfUrl
          }
        },
        "PARSED_READY_FOR_REVIEW"
      );
    });

    jobsHandledThisRun += 1;

    logger.info(
      {
        jobId: job.id,
        examId: exam.id,
        storedPdfUrl,
        extractionMethod: extractedDocument.method,
        chunkCount: chunks.length,
        jobsHandledThisRun,
        workerMaxJobsPerRun: config.workerMaxJobsPerRun
      },
      "Uploaded PDF, prepared knowledge chunks, and parsed exam JSON"
    );

    if (jobsHandledThisRun >= config.workerMaxJobsPerRun) {
      await worker.pause(true);
      setImmediate(() => {
        stopWorker(worker, "max_jobs_reached").catch((error) => {
          logger.error({ err: error.message }, "Worker shutdown failed");
          process.exit(1);
        });
      });
    }
  },
  {
    connection: {
      url: config.redisUrl
    },
    concurrency: 1
  }
);

logger.info(
  {
    queueName: config.pdfQueueName,
    workerMaxJobsPerRun: config.workerMaxJobsPerRun,
    concurrency: 1
  },
  "Worker started and waiting for jobs"
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Worker completed job");
});

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message }, "Worker failed job");

  jobsHandledThisRun += 1;
  if (jobsHandledThisRun >= config.workerMaxJobsPerRun) {
    worker.pause(true).catch(() => {});
    setImmediate(() => {
      stopWorker(worker, "max_jobs_reached_after_failure").catch((shutdownError) => {
        logger.error({ err: shutdownError.message }, "Worker shutdown failed");
        process.exit(1);
      });
    });
  }
});

const shutdown = async () => {
  await terminateExtractionResources().catch(() => {});
  await worker.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

