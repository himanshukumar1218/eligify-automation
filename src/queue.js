import { Queue } from "bullmq";
import { config } from "./config.js";

export async function createPdfQueue() {
  return new Queue(config.pdfQueueName, {
    connection: {
      url: config.redisUrl
    },
    defaultJobOptions: {
      attempts: 3,
      removeOnComplete: 1000,
      removeOnFail: 1000,
      backoff: {
        type: "exponential",
        delay: 2000
      }
    }
  });
}
