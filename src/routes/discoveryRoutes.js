import express from "express";
import { withClient } from "../db.js";
import { getExamJsonById, listReviewableExams, markExamPublished } from "../repositories/examRepository.js";

export const discoveryRoutes = express.Router();

discoveryRoutes.get("/", async (_request, response) => {
  try {
    const exams = await withClient((client) => listReviewableExams(client));
    response.json({ items: exams });
  } catch (error) {
    response.status(500).json({ message: error.message || "Failed to load discovered exams" });
  }
});

discoveryRoutes.get("/:id", async (request, response) => {
  try {
    const exam = await withClient((client) => getExamJsonById(client, Number(request.params.id)));

    if (!exam) {
      response.status(404).json({ message: "Discovered exam not found" });
      return;
    }

    response.json(exam);
  } catch (error) {
    response.status(500).json({ message: error.message || "Failed to load discovered exam" });
  }
});

discoveryRoutes.patch("/:id/publish", async (request, response) => {
  try {
    const exam = await withClient((client) => markExamPublished(client, Number(request.params.id)));

    if (!exam) {
      response.status(404).json({ message: "Discovered exam not found" });
      return;
    }

    response.json({ item: exam });
  } catch (error) {
    response.status(500).json({ message: error.message || "Failed to publish discovered exam" });
  }
});
