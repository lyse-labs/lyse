import { describe, expect, it } from "vitest";
import { isSuppressed, parseSuppressionDirectives } from "../inline.js";

describe("inline suppression", () => {
  it("parses next-line suppression", () => {
    const src = `// lyse-disable-next-line tokens/no-hardcoded-color reason="brand"\nconst c = "#fff";`;
    const dirs = parseSuppressionDirectives(src);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toMatchObject({
      kind: "next-line",
      ruleIds: ["tokens/no-hardcoded-color"],
      affectsLine: 2,
    });
  });

  it("parses file-level suppression", () => {
    const src = `/* lyse-disable tokens/no-hardcoded-spacing */\nconst pad = 7;`;
    const dirs = parseSuppressionDirectives(src);
    expect(dirs[0]?.kind).toBe("file");
  });

  it("isSuppressed returns true for matching rule/line", () => {
    const src = `// lyse-disable-next-line tokens/no-hardcoded-color\nconst c = "#fff";`;
    expect(isSuppressed(src, "tokens/no-hardcoded-color", 2)).toBe(true);
    expect(isSuppressed(src, "a11y/essentials", 2)).toBe(false);
  });
});
