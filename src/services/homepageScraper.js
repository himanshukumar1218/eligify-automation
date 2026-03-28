import { config } from "../config.js";
import { normalizeTitle } from "../utils/normalizeTitle.js";
import { withRetries } from "../utils/retry.js";
import { toAbsoluteUrl } from "../utils/url.js";

const HOMEPAGE_LATEST_JOBS_HEADER = "text=/^Latest Jobs$/i";

async function closePopups(page) {
  const popupSelectors = [
    "button[aria-label='Close']",
    "button:has-text('Close')",
    ".close",
    ".modal-close",
    ".mfp-close"
  ];

  for (const selector of popupSelectors) {
    const locator = page.locator(selector).first();

    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 1000 }).catch(() => {});
    }
  }

  await page.keyboard.press("Escape").catch(() => {});
}

function isLikelyJobTitle(title) {
  const lower = title.toLowerCase();
  return (
    lower.includes("form") ||
    lower.includes("recruitment") ||
    lower.includes("vacancy") ||
    lower.includes("bharti") ||
    lower.includes("posts")
  );
}

export async function scrapeHomepage(browser, logger) {
  return withRetries(
    async () => {
      const page = await browser.newPage({
        baseURL: config.scraperBaseUrl
      });

      page.setDefaultTimeout(config.navigationTimeoutMs);

      try {
        await page.goto("/", {
          waitUntil: "domcontentloaded",
          timeout: config.navigationTimeoutMs
        });

        await page.waitForLoadState("networkidle", {
          timeout: config.navigationTimeoutMs
        }).catch(() => {});

        await closePopups(page);

        const latestJobsHeading = page.locator(HOMEPAGE_LATEST_JOBS_HEADER).first();
        await latestJobsHeading.waitFor({ state: "visible", timeout: config.navigationTimeoutMs });

        const latestJobsList = latestJobsHeading.locator("xpath=following-sibling::*[self::ul or self::div][1]");
        await latestJobsList.waitFor({ state: "visible", timeout: config.navigationTimeoutMs });

        const links = latestJobsList.locator("a");
        const count = await links.count();
        const jobs = [];

        for (let index = 0; index < count; index += 1) {
          try {
            const link = links.nth(index);
            const title = (await link.innerText()).trim();
            const href = await link.getAttribute("href");
            const portalUrl = href ? toAbsoluteUrl(config.scraperBaseUrl, href) : null;
            const normalizedTitle = normalizeTitle(title);

            if (!title || !portalUrl || !normalizedTitle || !isLikelyJobTitle(title)) {
              continue;
            }

            jobs.push({
              title,
              normalizedTitle,
              portalUrl
            });
          } catch (error) {
            logger.warn({ index, err: error.message }, "Skipping malformed homepage job item");
          }
        }

        return jobs;
      } finally {
        await page.close();
      }
    },
    {
      retries: config.homepageRetryCount,
      label: "homepage-scrape",
      logger
    }
  );
}
