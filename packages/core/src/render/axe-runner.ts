import * as axe from "axe-core";
import type { Page } from "playwright";

export interface AxeViolation {
  ruleId: string;
  impact: string;
  nodes: number;
  help: string;
}

export function axeVersion(): string {
  return axe.version;
}

export async function injectAndRunAxe(
  page: Page,
  runOptions?: Record<string, unknown>,
): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axe.source });
  const raw = await page.evaluate(async (opts) => {
    const runner = (window as unknown as { axe: { run: (ctx: Document, o?: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; help: string; nodes: unknown[] }> }> } }).axe;
    const result = await runner.run(document, opts ?? { resultTypes: ["violations"] });
    return result.violations.map((v) => ({
      ruleId: v.id,
      impact: v.impact ?? "minor",
      nodes: v.nodes.length,
      help: v.help,
    }));
  }, runOptions);
  return [...raw].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

export async function runAxeOnStory(
  page: Page,
  storyUrl: string,
  runOptions?: Record<string, unknown>,
): Promise<AxeViolation[]> {
  await page.goto(storyUrl, { waitUntil: "load" });
  return injectAndRunAxe(page, runOptions);
}
