import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/components-no-style-escape-hatch.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoRoot: "/repo",
    tokens: null,
    componentsModule: "@org/ui",
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
    ...overrides,
  };
}

function makeParsed(files: Record<string, string>): ParsedFiles {
  const ts = Object.entries(files)
    .filter(([path]) => /\.(tsx|jsx)$/.test(path))
    .map(([path, source]) => ({ path, source, ast: null, imports: [] }));
  return { ts, css: [], cssInJs: [] };
}

describe("components/no-style-escape-hatch", () => {
  it("flags inline style on a DS component", async () => {
    const res = await rule.evaluate(
      makeCtx(),
      makeParsed({
        "package.json": PKG,
        "A.tsx": 'import {Button} from "@org/ui";\nexport const A = () => <Button style={{ color: "red" }} />;',
      }),
    );
    expect(res.findings.some((f) => f.message.includes("Button"))).toBe(true);
    expect(res.findings[0]?.ruleId).toBe("components/no-style-escape-hatch");
    expect(res.findings[0]?.axis).toBe("components");
    expect(res.findings[0]?.severity).toBe("warning");
  });

  it("does NOT flag inline style on raw HTML", async () => {
    const res = await rule.evaluate(
      makeCtx(),
      makeParsed({
        "package.json": PKG,
        "A.tsx": 'export const A = () => <div style={{ color: "red" }} />;',
      }),
    );
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag a DS component WITHOUT style", async () => {
    const res = await rule.evaluate(
      makeCtx(),
      makeParsed({
        "package.json": PKG,
        "A.tsx": 'import {Button} from "@org/ui";\nexport const A = () => <Button variant="primary" />;',
      }),
    );
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag in dsSelfMode", async () => {
    const res = await rule.evaluate(
      makeCtx({ dsSelfMode: true }),
      makeParsed({
        "package.json": PKG,
        "A.tsx": 'import {Button} from "@org/ui";\nexport const A = () => <Button style={{ color: "red" }} />;',
      }),
    );
    expect(res.findings).toHaveLength(0);
    expect(res.opportunities).toBe(0);
  });

  it("does NOT flag when no DS is configured", async () => {
    const res = await rule.evaluate(
      makeCtx({ componentsModule: null, componentInventory: [] }),
      makeParsed({
        "package.json": PKG,
        "A.tsx": 'import {Button} from "@org/ui";\nexport const A = () => <Button style={{ color: "red" }} />;',
      }),
    );
    expect(res.findings).toHaveLength(0);
    expect(res.opportunities).toBe(0);
  });

  it("counts opportunities = DS component elements inspected", async () => {
    const res = await rule.evaluate(
      makeCtx(),
      makeParsed({
        "package.json": PKG,
        "A.tsx": [
          'import {Button, Badge} from "@org/ui";',
          'export const A = () => (',
          "  <div>",
          '    <Button style={{ color: "red" }} />',
          "    <Badge />",
          "    <div style={{ margin: 0 }} />",
          "  </div>",
          ");",
        ].join("\n"),
      }),
    );
    // Button (with style) + Badge (without style) = 2 DS opportunities
    expect(res.opportunities).toBe(2);
    // Only Button has style → 1 finding
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.message).toContain("Button");
  });

  it("flags multiple DS components with style in one file", async () => {
    const res = await rule.evaluate(
      makeCtx(),
      makeParsed({
        "package.json": PKG,
        "A.tsx": [
          'import {Button, Badge} from "@org/ui";',
          'export const A = () => (',
          "  <div>",
          '    <Button style={{ color: "red" }} />',
          '    <Badge style={{ margin: 0 }} />',
          "  </div>",
          ");",
        ].join("\n"),
      }),
    );
    expect(res.findings).toHaveLength(2);
  });
});
