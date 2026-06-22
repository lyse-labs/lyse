import { RenderUnavailableError } from "./types.js";
import type { Page } from "playwright";

async function loadChromium() {
  try {
    const pw = await import("playwright");
    return pw.chromium;
  } catch {
    throw new RenderUnavailableError(
      "Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium` to use --render.",
    );
  }
}

export async function withChromium<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const chromium = await loadChromium();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    throw new RenderUnavailableError(
      "Chromium is not installed for Playwright. Run `npx playwright install chromium`.",
    );
  }
  try {
    const page = await browser.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export async function chromiumVersion(): Promise<string> {
  const chromium = await loadChromium();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    throw new RenderUnavailableError(
      "Chromium is not installed for Playwright. Run `npx playwright install chromium`.",
    );
  }
  try {
    return browser.version();
  } finally {
    await browser.close();
  }
}
