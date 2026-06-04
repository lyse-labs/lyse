import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatShareMarkdown, LINUX_CLIPBOARD_CANDIDATES, trySpawn } from "../../src/share/clipboard.js";

describe("formatShareMarkdown", () => {
  it("formats score + axes + findings + repo", () => {
    const md = formatShareMarkdown(
      67,
      { tokens: 58, a11y: 71, components: 74, stories: 65 },
      [
        { ruleId: "tokens/no-hardcoded-color", count: 12, fixable: true },
        { ruleId: "a11y/essentials", count: 3, fixable: false },
      ],
      "acme/web"
    );
    expect(md).toContain("**Lyse Health Score: 67/100**");
    expect(md).toContain("| tokens | 58 |");
    expect(md).toContain("tokens/no-hardcoded-color: 12 (auto-fixable)");
    expect(md).toContain("a11y/essentials: 3");
    expect(md).toContain("Repo: acme/web");
  });

  it("handles N/A axes", () => {
    const md = formatShareMarkdown(50, { tokens: 50, a11y: null, components: null, stories: null }, [], null);
    expect(md).toContain("| a11y | N/A |");
  });

  it("omits Repo line when null", () => {
    const md = formatShareMarkdown(50, { tokens: 50, a11y: 50, components: 50, stories: 50 }, [], null);
    expect(md).not.toContain("Repo:");
  });

  it("limits top findings to 5", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ruleId: `r/${i}`, count: 1, fixable: false }));
    const md = formatShareMarkdown(50, { tokens: 50, a11y: 50, components: 50, stories: 50 }, many, null);
    const lines = md.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(5);
  });

  it("handles N/A as final score", () => {
    const md = formatShareMarkdown("N/A", { tokens: 50, a11y: 50, components: 50, stories: 50 }, [], null);
    expect(md).toContain("**Lyse Health Score: N/A/100**");
  });
});

describe("Linux clipboard fallback chain (regression: X11 users had no clipboard support)", () => {
  it("LINUX_CLIPBOARD_CANDIDATES contains wl-copy, xclip, xsel in that order", () => {
    expect(LINUX_CLIPBOARD_CANDIDATES).toHaveLength(3);
    expect(LINUX_CLIPBOARD_CANDIDATES[0]!.cmd).toBe("wl-copy");
    expect(LINUX_CLIPBOARD_CANDIDATES[1]!.cmd).toBe("xclip");
    expect(LINUX_CLIPBOARD_CANDIDATES[2]!.cmd).toBe("xsel");
  });

  it("xclip candidate uses -selection clipboard args", () => {
    const xclip = LINUX_CLIPBOARD_CANDIDATES.find((c) => c.cmd === "xclip");
    expect(xclip?.args).toEqual(["-selection", "clipboard"]);
  });

  it("xsel candidate uses --clipboard --input args", () => {
    const xsel = LINUX_CLIPBOARD_CANDIDATES.find((c) => c.cmd === "xsel");
    expect(xsel?.args).toEqual(["--clipboard", "--input"]);
  });

  it("wl-copy candidate uses empty args (piped via stdin)", () => {
    const wl = LINUX_CLIPBOARD_CANDIDATES.find((c) => c.cmd === "wl-copy");
    expect(wl?.args).toEqual([]);
  });

  it("trySpawn is exported and is a function (used by Linux fallback loop)", () => {
    expect(typeof trySpawn).toBe("function");
  });
});
