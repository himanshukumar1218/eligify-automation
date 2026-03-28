import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { discoveryRoutes } from "./routes/discoveryRoutes.js";

export function startApiServer(logger) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });
  app.use("/api/discovery", discoveryRoutes);

  const server = app.listen(config.apiPort, () => {
    logger.info({ port: config.apiPort }, "Discovery API server started");
  });

  return server;
}
