import { config } from "../config.js";
import { validatePdfUrl } from "./pdfValidator.js";
import { withRetries } from "../utils/retry.js";
import { toAbsoluteUrl } from "../utils/url.js";

const PRIMARY_PATTERNS = [
  /check official notification/i,
  /download official notification/i,
  /check rulebook/i
];

const FALLBACK_PATTERNS = [
  /official notification/i,
  /rulebook/i,
  /download notification/i,
  /notification pdf/i
];

async function collectCandidateLinks(table, baseUrl) {
  const rows = table.locator("tr");
  const count = await rows.count();
  const candidates = [];

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const text = (await row.innerText().catch(() => "")).trim();
    const anchors = row.locator("a");
    const anchorCount = await anchors.count();
    const links = [];

    for (let anchorIndex = 0; anchorIndex < anchorCount; anchorIndex += 1) {
      const anchor = anchors.nth(anchorIndex);
      const href = await anchor.getAttribute("href").catch(() => null);
      const label = (await anchor.innerText().catch(() => "")).trim();
      const absoluteUrl = href ? toAbsoluteUrl(baseUrl, href) : null;

      links.push({
        label,
        url: absoluteUrl
      });
    }

    candidates.push({
      text,
      links
    });
  }

  return candidates;
}

async function pickValidatedPdf(candidates) {
  for (const candidate of candidates) {
    for (const link of candidate.links) {
      if (!link.url) {
        continue;
      }

      const isValid = await validatePdfUrl(link.url);
      if (isValid) {
        return link.url;
      }
    }
  }

  return null;
}

function hasInactiveNotificationMessage(candidates) {
  return candidates.some((candidate) => {
    const text = candidate.text.toLowerCase();
    return (
      text.includes("link activate soon") ||
      text.includes("link activate on") ||
      text.includes("available soon") ||
      text.includes("coming soon")
    );
  });
}

export async function extractOfficialPdf(browser, detailPageUrl, logger) {
  return withRetries(
    async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(config.navigationTimeoutMs);

      try {
        await page.goto(detailPageUrl, {
          waitUntil: "domcontentloaded",
          timeout: config.navigationTimeoutMs
        });

        await page.waitForLoadState("networkidle", {
          timeout: config.navigationTimeoutMs
        }).catch(() => {});

        const usefulLinksHeading = page.locator("text=/SOME USEFUL IMPORTANT LINKS/i").first();
        await usefulLinksHeading.waitFor({ state: "visible", timeout: config.navigationTimeoutMs });

        const table = usefulLinksHeading.locator("xpath=following::*[self::table][1]");
        await table.waitFor({ state: "visible", timeout: config.navigationTimeoutMs });

        const candidates = await collectCandidateLinks(table, detailPageUrl);
        const primaryMatches = candidates.filter((candidate) =>
          PRIMARY_PATTERNS.some((pattern) => pattern.test(candidate.text))
        );

        const primaryPdf = await pickValidatedPdf(primaryMatches);
        if (primaryPdf) {
          return primaryPdf;
        }

        if (primaryMatches.length > 0 && hasInactiveNotificationMessage(primaryMatches)) {
          throw new Error("Official notification link is present but not active yet");
        }

        const fallbackMatches = candidates.filter((candidate) =>
          FALLBACK_PATTERNS.some((pattern) => pattern.test(candidate.text))
        );

        const fallbackPdf = await pickValidatedPdf(fallbackMatches);
        if (fallbackPdf) {
          return fallbackPdf;
        }

        if (fallbackMatches.length > 0 && hasInactiveNotificationMessage(fallbackMatches)) {
          throw new Error("Notification link is present but not active yet");
        }

        throw new Error("Official notification PDF link not found");
      } finally {
        await page.close();
      }
    },
    {
      retries: config.detailRetryCount,
      label: "detail-page-pdf-extraction",
      logger
    }
  );
}
