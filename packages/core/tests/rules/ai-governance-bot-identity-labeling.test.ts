import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  isBotIdentityName,
} from "../../src/rules/ai-governance-bot-identity-labeling.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-bot-identity-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("isBotIdentityName", () => {
  it("matches distinctive avatar/persona/identity compounds", () => {
    expect(isBotIdentityName("AiAvatar")).toBe(true);
    expect(isBotIdentityName("BotAvatar")).toBe(true);
    expect(isBotIdentityName("AssistantAvatar")).toBe(true);
    expect(isBotIdentityName("BotPersona")).toBe(true);
    expect(isBotIdentityName("NonHumanBadge")).toBe(true);
    expect(isBotIdentityName("ai-avatar")).toBe(true);
  });
  it("does NOT false-fire on bare bot-substring words or generic primitives", () => {
    expect(isBotIdentityName("BottomSheet")).toBe(false);
    expect(isBotIdentityName("Robot")).toBe(false);
    expect(isBotIdentityName("Avatar")).toBe(false);
    expect(isBotIdentityName("Button")).toBe(false);
  });
});

describe("rule ai-governance/bot-identity-labeling", () => {
  it("emits info when a non-human identity label is co-located with an AI marker", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AiChat.tsx"),
      ["export const AILabel = () => null;", "export const AiAvatar = () => null;"].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("AiAvatar");
  });

  it("emits warning when an AI marker exists but no identity label is found", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "AILabel.tsx"), "export const AILabel = () => null;");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("does NOT earn credit for a generic Avatar in a file with no AI marker → warning", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(join(tmp, "src", "components", "Avatar.tsx"), "export const Avatar = () => null;");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("emits no finding when no AI marker is present anywhere", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    // NonHumanBadge is an identity name but carries no AI-marker token, so with
    // no AI surface anywhere the rule stays silent (DS not penalized).
    writeFileSync(join(tmp, "src", "components", "NonHumanBadge.tsx"), "export const NonHumanBadge = () => null;");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("emits no finding when README.md contains the lyse-disable directive", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(join(tmp, "README.md"), "<!-- lyse-disable ai-governance/bot-identity-labeling -->\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });
});
