import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  base: {
    service: "sarkari-result-scraper",
    env: config.appEnv
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
