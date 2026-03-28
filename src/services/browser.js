import { chromium } from "playwright";
import { config } from "../config.js";

export async function launchBrowser() {
  return chromium.launch({
    headless: config.playwrightHeadless
  });
}
