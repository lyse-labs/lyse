import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  isFeedbackControlName,
  detectCategorizedFeedback,
} from "../../src/rules/ai-governance-feedback-control-present.js";
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

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-feedback-control-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Unit: isFeedbackControlName
// ---------------------------------------------------------------------------
describe("isFeedbackControlName", () => {
  it("matches *Feedback* components", () => {
    expect(isFeedbackControlName("AiFeedback")).toBe(true);
    expect(isFeedbackControlName("FeedbackPanel")).toBe(true);
    expect(isFeedbackControlName("MessageFeedback")).toBe(true);
  });

  it("matches *ThumbsUp* / *ThumbsDown* components", () => {
    expect(isFeedbackControlName("ThumbsUp")).toBe(true);
    expect(isFeedbackControlName("ThumbsDown")).toBe(true);
    expect(isFeedbackControlName("AiThumbsUpButton")).toBe(true);
  });

  it("matches *Rating* components", () => {
    expect(isFeedbackControlName("StarRating")).toBe(true);
    expect(isFeedbackControlName("RatingControl")).toBe(true);
    expect(isFeedbackControlName("AiRating")).toBe(true);
  });

  it("matches *Vote* components", () => {
    expect(isFeedbackControlName("UpvoteButton")).toBe(true);
    expect(isFeedbackControlName("VotePanel")).toBe(true);
    expect(isFeedbackControlName("ResponseVote")).toBe(true);
  });

  it("matches *Helpful* components", () => {
    expect(isFeedbackControlName("HelpfulButton")).toBe(true);
    expect(isFeedbackControlName("WasThisHelpful")).toBe(true);
    expect(isFeedbackControlName("NotHelpful")).toBe(true);
  });

  it("does NOT match unrelated names", () => {
    expect(isFeedbackControlName("Button")).toBe(false);
    expect(isFeedbackControlName("AILabel")).toBe(false);
    expect(isFeedbackControlName("Dialog")).toBe(false);
    expect(isFeedbackControlName("ThumbsUpIcon")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: detectCategorizedFeedback
// ---------------------------------------------------------------------------
describe("detectCategorizedFeedback", () => {
  it("detects a reason enum in source", () => {
    const src = `export const FeedbackReason = {
    inaccurate: "inaccurate",
    unhelpful: "unhelpful",
    offensive: "offensive",
  } as const;`;
    expect(detectCategorizedFeedback(src)).toBe(true);
  });

  it("detects a reason prop union type in source", () => {
    const src = `type FeedbackReason = "inaccurate" | "unhelpful" | "offensive";`;
    expect(detectCategorizedFeedback(src)).toBe(true);
  });

  it("detects reason options array in source", () => {
    const src = `const feedbackOptions = ["inaccurate", "unhelpful", "tooLong"] as const;`;
    expect(detectCategorizedFeedback(src)).toBe(true);
  });

  it("does NOT flag a generic options array", () => {
    const src = `const options = ["yes", "no"] as const;`;
    expect(detectCategorizedFeedback(src)).toBe(false);
  });

  it("does NOT flag a file with no categorization signal", () => {
    const src = `export const ThumbsUp = () => null;`;
    expect(detectCategorizedFeedback(src)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: rule.evaluate
// ---------------------------------------------------------------------------
describe("rule ai-governance/feedback-control-present", () => {
  // Fixture 1: thumbs up/down component exported alongside AI-marker → info
  it("emits info when ThumbsUp/ThumbsDown components are exported with an AI-marker", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      [
        "export { AILabel } from './ai-label';",
        "export { ThumbsUp, ThumbsDown } from './thumbs';",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("info");
    expect(f.axis).toBe("ai-governance");
    expect(f.ruleId).toBe("ai-governance/feedback-control-present");
    expect(f.message).toContain("HAX G15");
    expect(f.message).not.toContain("categorized");
  });

  // Fixture 2: categorized feedback (reason enum) → info noting categorized
  it("emits info noting categorized when feedback component has reason enum", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AIBadge.tsx"),
      "export const AIBadge = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "AiFeedback.tsx"),
      [
        "export const AiFeedback = () => null;",
        "export const FeedbackReason = { inaccurate: 'inaccurate', unhelpful: 'unhelpful' } as const;",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("info");
    expect(f.message).toContain("categorized");
    expect(f.message).toContain("HAX G15");
  });

  // Fixture 3: StarRating component → info (not categorized)
  it("emits info when StarRating is exported with a GenAI marker", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "GenAIAvatar.tsx"),
      "export const GenAIAvatar = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "StarRating.tsx"),
      "export const StarRating = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("StarRating");
    expect(result.findings[0]!.message).not.toContain("categorized");
  });

  // Fixture 4: AI-marker present but no feedback control → warning
  it("emits warning when AI-marker exists but no feedback control is found", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      [
        "export { AILabel } from './ai-label';",
        "export { Button } from './button';",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("warning");
    expect(f.message).toContain("no feedback control");
    expect(f.message).toContain("HAX G15");
  });

  // Fixture 5: Vue SFC feedback component → info
  it("emits info for a Vue SFC feedback component exported with magic-* AI-marker", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "magic-badge.vue"),
      "<template><span>AI</span></template>\n<script>\nexport default { name: 'magic-badge' };\n</script>",
    );
    writeFileSync(
      join(tmp, "src", "components", "ResponseFeedback.vue"),
      "<template><div>Feedback</div></template>\n<script>\nexport default { name: 'ResponseFeedback' };\n</script>",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("ResponseFeedback");
  });

  // Fixture 6: No AI-marker at all → no finding
  it("emits no finding when no AI-marker component is present", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      [
        "export { Button } from './button';",
        "export { ThumbsUp } from './thumbs';",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  // Fixture 7: repoRoot not set → no finding
  it("returns no findings when repoRoot is not set", async () => {
    const ctx: RuleContext = {
      repoRoot: "",
      tokens: null,
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: [],
    };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 8: allowlist suppression
  it("emits no finding when README.md contains the lyse-disable directive", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { AILabel } from './ai-label';\nexport { Button } from './button';",
    );
    writeFileSync(
      join(tmp, "README.md"),
      "# My DS\n\n<!-- lyse-disable ai-governance/feedback-control-present -->\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});
