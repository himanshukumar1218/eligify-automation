import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pdfParse from "pdf-parse";
import { createWorker } from "tesseract.js";
import { config } from "../config.js";

const DIRECT_TEXT_THRESHOLD = 500;
let sharedOcrWorkerPromise;

function normalizeExtractedText(text) {
  return text.replace(/\r/g, "").replace(/\u0000/g, "").trim();
}

function splitParsedPages(text) {
  const normalized = normalizeExtractedText(text);

  if (!normalized) {
    return [];
  }

  const pages = normalized
    .split(/\f+/)
    .map((pageText) => normalizeExtractedText(pageText))
    .filter(Boolean);

  if (pages.length > 0) {
    return pages.map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText
    }));
  }

  return [
    {
      pageNumber: 1,
      text: normalized
    }
  ];
}

async function getOcrWorker() {
  if (!sharedOcrWorkerPromise) {
    sharedOcrWorkerPromise = createWorker(config.ocrLanguages);
  }

  return sharedOcrWorkerPromise;
}

async function recognizeImageFile(worker, imageBuffer, pageNumber) {
  const tempFilePath = path.join(
    os.tmpdir(),
    `ocr-page-${process.pid}-${Date.now()}-${pageNumber}.png`
  );

  await fs.writeFile(tempFilePath, Buffer.from(imageBuffer));

  try {
    const result = await worker.recognize(tempFilePath);
    return normalizeExtractedText(result.data.text ?? "");
  } finally {
    await fs.unlink(tempFilePath).catch(() => {});
  }
}

async function extractTextWithOcr(pdfBuffer) {
  const pdfToImageModule = await import("pdf-img-convert");
  const convert = pdfToImageModule.convert ?? pdfToImageModule.default?.convert;

  if (typeof convert !== "function") {
    throw new Error("pdf-img-convert convert function is unavailable");
  }

  const imagePages = await convert(pdfBuffer, {
    scale: 2
  });
  const worker = await getOcrWorker();
  const pages = [];

  for (let index = 0; index < imagePages.length; index += 1) {
    const text = await recognizeImageFile(worker, imagePages[index], index + 1);

    pages.push({
      pageNumber: index + 1,
      text
    });
  }

  return pages.filter((page) => page.text.length > 0);
}

export async function extractPdfText(pdfBuffer) {
  const parsed = await pdfParse(pdfBuffer);
  const directText = normalizeExtractedText(parsed.text ?? "");

  if (directText.length > DIRECT_TEXT_THRESHOLD) {
    const pages = splitParsedPages(directText);

    return {
      method: "selectable_text",
      text: directText,
      pages
    };
  }

  try {
    const ocrPages = await extractTextWithOcr(pdfBuffer);
    const combinedText = ocrPages.map((page) => page.text).join("\n\n").trim();

    if (combinedText) {
      return {
        method: "ocr",
        text: combinedText,
        pages: ocrPages
      };
    }
  } catch (error) {
    if (!directText) {
      throw error;
    }
  }

  return {
    method: directText ? "selectable_text_partial" : "ocr",
    text: directText,
    pages: splitParsedPages(directText)
  };
}

export async function terminateExtractionResources() {
  if (!sharedOcrWorkerPromise) {
    return;
  }

  const worker = await sharedOcrWorkerPromise;
  await worker.terminate();
  sharedOcrWorkerPromise = null;
}
