import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixHardcodedColor } from "../../src/codemods/tokens-color.js";
import { fixHardcodedSpacing } from "../../src/codemods/tokens-spacing.js";
import type { Finding, RuleContext } from "../../src/types.js";

function initGitRepo(tmp: string, fileName: string, source: string): void {
  execSync("git init -q", { cwd: tmp });
  execSync('git config user.email "t@t"', { cwd: tmp });
  execSync('git config user.name "t"', { cwd: tmp });
  writeFileSync(join(tmp, fileName), source);
  execSync("git add . && git commit -q -m init", { cwd: tmp });
}

describe("generated diffs apply cleanly via git apply", () => {
  it("color fix patch applies via git apply --check", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-apply-color-"));
    const source = `import React from "react";\nconst x = "#2563eb";\nexport const y = x;\n`;
    initGitRepo(tmp, "x.tsx", source);

    const ctx: RuleContext = {
      repoRoot: tmp,
      tokens: {
        colors: new Map([["#2563eb", ["primary"]]]),
        spacing: new Map(),
        typography: new Map(),
        radii: new Map(),
        shadows: new Map(),
        motion: new Map(),
        breakpoints: new Map(),
        zIndex: new Map(),
        opacity: new Map(),
        borderWidth: new Map(),
        source: "tailwind-v3",
      },
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: [],
    };
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "x.tsx", line: 2, column: 1 },
      message: "x",
    };

    const r = fixHardcodedColor({ source, path: "x.tsx", finding, ctx });
    expect(r.patch).not.toBeNull();

    const patchPath = join(tmp, "x.patch");
    writeFileSync(patchPath, r.patch!);
    // git apply --check fails (throws) if the patch cannot apply cleanly
    expect(() =>
      execSync(`git apply --check "${patchPath}"`, { cwd: tmp, stdio: "pipe" }),
    ).not.toThrow();
  });

  it("spacing fix patch applies via git apply --check", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-apply-spacing-"));
    const source = `const style = { padding: "16px" };\n`;
    initGitRepo(tmp, "x.tsx", source);

    const ctx: RuleContext = {
      repoRoot: tmp,
      tokens: {
        colors: new Map(),
        spacing: new Map([["16", ["4"]]]),
        typography: new Map(),
        radii: new Map(),
        shadows: new Map(),
        motion: new Map(),
        breakpoints: new Map(),
        zIndex: new Map(),
        opacity: new Map(),
        borderWidth: new Map(),
        source: "tailwind-v3",
      },
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: [],
    };
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-spacing",
      axis: "tokens",
      severity: "warning",
      location: { file: "x.tsx", line: 1, column: 1 },
      message: "x",
    };

    const r = fixHardcodedSpacing({ source, path: "x.tsx", finding, ctx });
    expect(r.patch).not.toBeNull();

    const patchPath = join(tmp, "x.patch");
    writeFileSync(patchPath, r.patch!);
    expect(() =>
      execSync(`git apply --check "${patchPath}"`, { cwd: tmp, stdio: "pipe" }),
    ).not.toThrow();
  });
});
