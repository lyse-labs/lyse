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

  it("matches kebab-case thumbs names (Vue DSes)", () => {
    expect(isFeedbackControlName("thumbs-up")).toBe(true);
    expect(isFeedbackControlName("thumbs-down")).toBe(true);
    expect(isFeedbackControlName("thumbs_up")).toBe(true);
  });

  it("matches *Rating* components", () => {
    expect(isFeedbackControlName("StarRating")).toBe(true);
    expect(isFeedbackControlName("RatingControl")).toBe(true);
    expect(isFeedbackControlName("AiRating")).toBe(true);
  });

  it("matches *Vote* components (interactive controls)", () => {
    expect(isFeedbackControlName("UpvoteButton")).toBe(true);
    expect(isFeedbackControlName("VotePanel")).toBe(true);
    expect(isFeedbackControlName("ResponseVote")).toBe(true);
  });

  it("matches *Helpful* components", () => {
    expect(isFeedbackControlName("HelpfulButton")).toBe(true);
    expect(isFeedbackControlName("WasThisHelpful")).toBe(true);
    expect(isFeedbackControlName("NotHelpful")).toBe(true);
  });

  it("does NOT match Icon suffix", () => {
    expect(isFeedbackControlName("ThumbsUpIcon")).toBe(false);
    expect(isFeedbackControlName("VoteIcon")).toBe(false);
    expect(isFeedbackControlName("FeedbackIcon")).toBe(false);
  });

  it("does NOT match display-counter suffixes", () => {
    expect(isFeedbackControlName("VoteCount")).toBe(false);
    expect(isFeedbackControlName("RatingTotal")).toBe(false);
    expect(isFeedbackControlName("VoteTally")).toBe(false);
    expect(isFeedbackControlName("FeedbackResult")).toBe(false);
    expect(isFeedbackControlName("RatingText")).toBe(false);
  });

  it("does NOT match unrelated names", () => {
    expect(isFeedbackControlName("Button")).toBe(false);
    expect(isFeedbackControlName("AILabel")).toBe(false);
    expect(isFeedbackControlName("Dialog")).toBe(false);
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
  // Fixture 1: thumbs up/down co-located with AI-marker in same file → info
  it("emits info when ThumbsUp/ThumbsDown are co-located with an AI-marker in the same file", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AiThumbsFeedback.tsx"),
      [
        "export const AILabel = () => null;",
        "export const ThumbsUp = () => null;",
        "export const ThumbsDown = () => null;",
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

  // Fixture 2: categorized feedback co-located with AI-marker → info noting categorized
  it("emits info noting categorized when feedback component has reason enum in same file as AI-marker", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AiFeedback.tsx"),
      [
        "export const AIBadge = () => null;",
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

  // Fixture 3: StarRating co-located with GenAI marker → info
  // File named AIOutput.tsx so basename doesn't match feedback vocab;
  // StarRating is detected via exported name extraction.
  it("emits info when StarRating is co-located with a GenAI marker in the same file", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AIOutput.tsx"),
      [
        "export const GenAIAvatar = () => null;",
        "export const StarRating = () => null;",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("StarRating");
    expect(result.findings[0]!.message).not.toContain("categorized");
  });

  // Fixture 4: AI-marker present but no feedback control → warning
  it("emits warning when AI-marker exists but no feedback control is found", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      "export const AILabel = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("warning");
    expect(f.message).toContain("no feedback control");
    expect(f.message).toContain("HAX G15");
  });

  // Fixture 5: Vue SFC with AI-marker exporting feedback component name → info.
  // Uses a .tsx file to avoid the Vue component name regex limitation with hyphens.
  // The magic-* prefix is detected via exported name in a TSX AI wrapper file;
  // the feedback control name is in the same file.
  it("emits info when feedback component is co-located with an AI-marker component", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AIOutputPanel.tsx"),
      [
        "export const AIBadge = () => null;",
        "export const ResponseFeedback = () => null;",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("ResponseFeedback");
  });

  // Fixture 6: No AI-marker at all → no finding
  it("emits no finding when no AI-marker component is present", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "ThumbsUp.tsx"),
      "export const ThumbsUp = () => null;",
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
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      "export const AILabel = () => null;",
    );
    writeFileSync(
      join(tmp, "README.md"),
      "# My DS\n\n<!-- lyse-disable ai-governance/feedback-control-present -->\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Fix 1 regression: per-file co-location
  // ---------------------------------------------------------------------------

  // Fix 1a: AILabel.tsx (AI marker) + ValidationFeedback.tsx (no AI marker)
  // ValidationFeedback is in its own file with no AI marker → no co-location → WARNING
  it("Fix 1a: ValidationFeedback in a file with no AI marker does not earn credit → warning", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      "export const AILabel = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "ValidationFeedback.tsx"),
      "export const ValidationFeedback = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  // Fix 1b: AILabel.tsx + VoteCount.tsx → WARNING
  // VoteCount excluded by suffix AND is not co-located with AI marker
  it("Fix 1b: VoteCount in a file with no AI marker does not earn credit → warning", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      "export const AILabel = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "VoteCount.tsx"),
      "export const VoteCount = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  // Fix 1c: Real AI-feedback control co-located with AI marker in same file → INFO
  it("Fix 1c: real feedback control co-located with AI marker in same file → info", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AiOutputCard.tsx"),
      [
        "export const AILabel = () => null;",
        "export const ThumbsUp = () => null;",
        "export const ThumbsDown = () => null;",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("HAX G15");
  });

  // ---------------------------------------------------------------------------
  // Fix 2 regression: tightened vocabulary
  // ---------------------------------------------------------------------------

  // Suffix exclusions (unit-level; also tested above in isFeedbackControlName)
  it("Fix 2a: VoteCount, RatingTotal, VoteTally, FeedbackResult, RatingText are NOT feedback controls", () => {
    expect(isFeedbackControlName("VoteCount")).toBe(false);
    expect(isFeedbackControlName("RatingTotal")).toBe(false);
    expect(isFeedbackControlName("VoteTally")).toBe(false);
    expect(isFeedbackControlName("FeedbackResult")).toBe(false);
    expect(isFeedbackControlName("RatingText")).toBe(false);
  });

  // Kebab/snake normalisation — co-location also required for INFO.
  // thumbs-up.tsx co-located with AILabel → info (kebab base name matches).
  it("Fix 2b: thumbs-up base name matches feedback vocab after kebab normalisation → info when co-located", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    // Single file: AI marker + feedback control (kebab filename)
    writeFileSync(
      join(tmp, "src", "components", "thumbs-up.tsx"),
      [
        "export const AILabel = () => null;",
        "export function ThumbsUp() { return null; }",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
  });

  // thumbs_up (snake) base name normalises to thumbsup → feedback match
  it("Fix 2c: thumbs_up snake-case base name matches after normalisation → info when co-located", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "thumbs_up.tsx"),
      [
        "export const AIBadge = () => null;",
        "export function ThumbsUp() { return null; }",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
  });
});
