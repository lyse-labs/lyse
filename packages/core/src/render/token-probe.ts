import type { Page } from "playwright";
import type { ComputedTokenReading } from "./types.js";

export async function probeComputedTokens(
  page: Page,
  css: string,
  tokens: string[],
  modeSelectors: string[],
): Promise<ComputedTokenReading[]> {
  const modeBodies = modeSelectors
    .map((sel, i) => `<div class="${sel.replace(/^\./, "")}" id="m${i}"></div>`)
    .join("");
  await page.setContent(`<!doctype html><style>${css}</style><body>${modeBodies}</body>`);

  const probe = async (sel: string): Promise<Record<string, string>> =>
    page.evaluate(
      ([selector, names]) => {
        const el = selector === "root" ? document.documentElement : document.querySelector(selector);
        const style = el ? getComputedStyle(el as Element) : null;
        const out: Record<string, string> = {};
        for (const n of names) out[n] = style ? style.getPropertyValue(n).trim() : "";
        return out;
      },
      [sel === "root" ? "root" : `#m${modeSelectors.indexOf(sel)}`, tokens] as const,
    );

  const readings: ComputedTokenReading[] = [];
  for (const mode of ["root", ...modeSelectors]) {
    const values = await probe(mode);
    for (const token of tokens) readings.push({ token, mode, computed: values[token] ?? "" });
  }
  return readings;
}
