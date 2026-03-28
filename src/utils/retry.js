function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries(task, options) {
  const {
    retries,
    label,
    logger,
    initialDelayMs = 1000,
    factor = 2
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= retries) {
        break;
      }

      const delayMs = initialDelayMs * (factor ** (attempt - 1));

      logger.warn(
        {
          label,
          attempt,
          retries,
          delayMs,
          err: error.message
        },
        "Retrying operation after failure"
      );

      await sleep(delayMs);
    }
  }

  throw lastError;
}
