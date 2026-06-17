import { describe, it, expect } from "vitest";
import { parseFileOverrides } from "../../src/suppression/frontmatter.js";

const block = (body: string) => `/**\n * @lyse-overrides\n${body} */\nimport React from "react";\n`;

describe("parseFileOverrides", () => {
  it("returns empty when no @lyse-overrides block is present", () => {
    const o = parseFileOverrides('import React from "react";\nconst x = "#fff";');
    expect(o.off.size).toBe(0);
    expect(o.severity.size).toBe(0);
  });

  it("parses an `off` entry into the off set", () => {
    const o = parseFileOverrides(block(" *   stories/coverage: off\n"));
    expect(o.off.has("stories/coverage")).toBe(true);
    expect(o.severity.size).toBe(0);
  });

  it("parses a real severity into the severity map", () => {
    const o = parseFileOverrides(block(" *   tokens/no-hardcoded-color: error\n"));
    expect(o.severity.get("tokens/no-hardcoded-color")).toBe("error");
    expect(o.off.size).toBe(0);
  });

  it("parses multiple entries (mixed off + severity)", () => {
    const o = parseFileOverrides(
      block(" *   tokens/no-hardcoded-color: error\n *   stories/coverage: off\n"),
    );
    expect(o.severity.get("tokens/no-hardcoded-color")).toBe("error");
    expect(o.off.has("stories/coverage")).toBe(true);
  });

  it("stops parsing at the first non-entry comment line", () => {
    const o = parseFileOverrides(
      block(" *   tokens/no-hardcoded-color: error\n * some prose\n *   a11y/essentials: off\n"),
    );
    expect(o.severity.get("tokens/no-hardcoded-color")).toBe("error");
    expect(o.off.has("a11y/essentials")).toBe(false);
  });

  it("ignores an invalid severity value", () => {
    const o = parseFileOverrides(block(" *   tokens/no-hardcoded-color: critical\n"));
    expect(o.severity.size).toBe(0);
    expect(o.off.size).toBe(0);
  });
});
