import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/components-icon-decorative-aria.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(ts: { path: string; source: string }[]): ParsedFiles {
  return { ts: ts.map((f): ParsedTsFile => ({ path: f.path, ast: null, source: f.source, imports: [] })), css: [], cssInJs: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-icon-aria-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule components/icon-decorative-aria", () => {
  it("flags a bare inline <svg> with no aria/role/title", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.tsx", source: "export const I = () => <svg viewBox=\"0 0 16 16\"><path d=\"M0 0\" /></svg>;" }]));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("components/icon-decorative-aria");
  });

  it("clears an svg with aria-hidden", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.tsx", source: "export const I = () => <svg aria-hidden=\"true\" viewBox=\"0 0 16 16\"><path/></svg>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("clears an svg with role=img and aria-label (meaningful icon)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.tsx", source: "export const I = () => <svg role=\"img\" aria-label=\"Search\"><path/></svg>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("clears an svg with an aria-labelledby", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.tsx", source: "export const I = () => <svg aria-labelledby=\"t\"><title id=\"t\">X</title><path/></svg>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("clears an svg with a <title> child", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.tsx", source: "export const I = () => <svg><title>Close</title><path/></svg>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("clears an svg with focusable + role", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.tsx", source: "export const I = () => <svg role=\"presentation\"><path/></svg>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("reports N/A when there is no inline svg", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "B.tsx", source: "export const B = () => <button>x</button>;" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("counts a compliant svg as an opportunity", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.tsx", source: "export const I = () => <svg aria-hidden=\"true\"><path/></svg>;" }]));
    expect(r.opportunities).toBe(1);
  });

  it("does not scan non-tsx/jsx files", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.ts", source: "const s = '<svg></svg>';" }]));
    expect(r.opportunities).toBe(0);
  });

  it("skips low-signal files", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.stories.tsx", source: "export const S = () => <svg><path/></svg>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable components/icon-decorative-aria\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "I.tsx", source: "export const I = () => <svg><path/></svg>;" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.scanBareSvgs).toBe("function");
    expect(typeof _internal.isAllowlisted).toBe("function");
  });
});
