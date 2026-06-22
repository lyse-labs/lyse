import { describe, it, expect } from "vitest";
import { teal, dim, bar, statusDot, severityColor } from "../../src/reporters/terminal-format.js";
import type { TerminalOpts } from "../../src/reporters/terminal-format.js";

const base: TerminalOpts = {
  mode: "default", color: false, unicode: false, width: 80,
  outDir: undefined, fileCount: 1, durationMs: 0, cwd: "/tmp",
};

describe("terminal-format token delegation", () => {
  it("no-color mode is plain text", () => {
    expect(teal("lyse", base)).toBe("lyse");
    expect(dim("x", base)).toBe("x");
    expect(severityColor("error", base)("e")).toBe("e");
  });

  it("bar uses ASCII glyphs in no-unicode mode", () => {
    expect(bar(50, base, 10)).toBe("#####-----");
  });

  it("statusDot is the ASCII bullet in no-unicode mode", () => {
    expect(statusDot(85, base)).toBe("o");
    expect(statusDot("N/A", base)).toBe("o");
  });

  it("teal emits ANSI when color is on", () => {
    const out = teal("lyse", { ...base, color: true });
    expect(out).not.toBe("lyse");
    expect(out).toContain("lyse");
  });
});
