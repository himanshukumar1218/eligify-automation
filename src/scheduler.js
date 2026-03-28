import cron from "node-cron";

export function startScheduler(schedule, handler, logger) {
  const task = cron.schedule(
    schedule,
    async () => {
      try {
        await handler();
      } catch (error) {
        logger.error({ err: error.message }, "Scheduled scraper run failed");
      }
    },
    {
      scheduled: true
    }
  );

  logger.info({ schedule }, "Scheduler started");
  return task;
}
