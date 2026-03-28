import { assertConfig, config } from "./config.js";
import { withClient, pool } from "./db.js";
import { getPendingExamsForRequeue } from "./repositories/examRepository.js";
import { createPdfQueue } from "./queue.js";
import { logger } from "./logger.js";

assertConfig();

async function main() {
  const queue = await createPdfQueue();

  try {
    const exams = await withClient((client) =>
      getPendingExamsForRequeue(client, config.workerMaxJobsPerRun)
    );

    if (exams.length === 0) {
      logger.info("No pending exams found to requeue");
      return;
    }

    for (const exam of exams) {
      const jobPayload = {
        exam_id: exam.id,
        normalized_title: exam.normalized_title,
        title: exam.title,
        official_pdf_url: exam.official_pdf_url,
        portal_url: exam.portal_url,
        discovered_at: exam.discovered_at
      };

      await queue.add("process-official-pdf", jobPayload, {
        jobId: `${exam.normalized_title}-requeue-${Date.now()}`
      });

      logger.info(
        { examId: exam.id, title: exam.title, discoveryStatus: exam.discovery_status },
        "Requeued pending exam"
      );
    }
  } finally {
    await queue.close();
    await pool.end();
  }
}

main().catch(async (error) => {
  logger.error({ err: error.message }, "Failed to requeue pending exams");
  await pool.end().catch(() => {});
  process.exit(1);
});
