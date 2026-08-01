import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectInteractionHandlers,
  hasAnalyticsInstrumentation,
  rule,
} from "../../src/rules/ai-governance-product-analytics.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
function makeCtx(repoRoot: string): RuleContext {
  return {
    repoRoot,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

describe("detectInteractionHandlers", () => {
  it("detects onAccept / onReject / onFeedback props with line numbers", () => {
    const src = "const X = () => (\n  <Row onAccept={a} />\n);\n";
    const hits = detectInteractionHandlers(src);
    expect(hits.map((h) => h.match)).toContain("onAccept");
    expect(hits[0]!.line).toBe(2);
  });
  it('detects data-action="accept|reject|feedback"', () => {
    const hits = detectInteractionHandlers('<button data-action="reject">no</button>');
    expect(hits.some((h) => h.match.includes("reject"))).toBe(true);
  });
  it("ignores unrelated handlers", () => {
    expect(detectInteractionHandlers("<div onClick={x} onScroll={y} />")).toHaveLength(0);
  });
});

describe("hasAnalyticsInstrumentation", () => {
  it("is true for known analytics calls", () => {
    for (const s of [
      "track('accepted')",
      "analytics.track('x')",
      "posthog.capture('x')",
      "gtag('event','x')",
      "logEvent('x')",
      "window.dataLayer.push({})",
      "const a = useAnalytics();",
      "trackEvent('x')",
    ]) {
      expect(hasAnalyticsInstrumentation(s)).toBe(true);
    }
  });
  it("is false when absent and has no substring false positive", () => {
    expect(hasAnalyticsInstrumentation("const x = 1;")).toBe(false);
    expect(hasAnalyticsInstrumentation("backtrack(x)")).toBe(false);
  });
});

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-apa-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function writeComp(rel: string, body: string): void {
  const abs = join(tmp, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

describe("rule ai-governance/product-analytics", () => {
  it("warns: AI surface + accept/reject handler + NO analytics", async () => {
    writeComp("src/AiSuggestion.tsx", "export const AILabel = () => null;\nexport const Row = () => <div onAccept={a} onReject={b} />;\n");
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]!.severity).toBe("warning");
    expect(res.findings[0]!.ruleId).toBe("ai-governance/product-analytics");
  });
  it("clean: AI surface + handler + analytics call", async () => {
    writeComp("src/AiSuggestion.tsx", "export const AILabel = () => null;\nexport const Row = () => <div onAccept={() => analytics.track('x')} />;\n");
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
  });
  it("out of scope: non-AI file with handlers", async () => {
    writeComp("src/Plain.tsx", "export const Row = () => <div onAccept={a} onReject={b} />;\n");
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
  });
  it("out of scope: AI surface with no accept/reject/feedback handler", async () => {
    writeComp("src/AiCard.tsx", "export const AILabel = () => null;\nexport const Card = () => <div onClick={a} />;\n");
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
  });

  // The rule counted one opportunity per component file whatever the repo
  // contained, while its two siblings (ai-content-live-region,
  // ai-loading-error-states) return 0 without an AI surface. Findings can only
  // fire on AI-marked files, so on a repo with no AI every opportunity was
  // clean by construction and the ai-governance axis read 100% adoption —
  // element-plus n=965, mantine n=3138, primer-react n=666, none of which ship
  // an AI feature. A perfect score for not having the thing being measured.
  describe("opportunities require an AI surface, like the sibling rules", () => {
    it("reports zero opportunities when no file carries an AI marker", async () => {
      writeComp("src/Button.tsx", "export const Button = () => <button onAccept={a} />;\n");
      writeComp("src/Card.tsx", "export const Card = () => <div />;\n");
      const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(res.opportunities).toBe(0);
    });

    it("still reports opportunities once the repo has an AI surface", async () => {
      writeComp("src/AiSuggestion.tsx", "export const AILabel = () => null;\nexport const Row = () => <div onAccept={a} />;\n");
      writeComp("src/Card.tsx", "export const Card = () => <div />;\n");
      const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(res.opportunities).toBeGreaterThan(0);
    });
  });
});
