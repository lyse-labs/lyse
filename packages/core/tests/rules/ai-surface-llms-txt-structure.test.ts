import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-surface-llms-txt-structure.js";
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

const VALID_FULL = `# Acme DS

> A token-first React design system for fast UI delivery.

A short context paragraph explaining the project.

## Docs

- [Quickstart](https://acme.dev/quickstart): Get started in 3 minutes.
- [API reference](https://acme.dev/api): Full method index.

## Examples

- [Hello world](https://acme.dev/hello): Minimal example.

## Optional

- [Blog](https://acme.dev/blog): Long-form deep dives.
`;

const VALID_MINIMAL = `# Acme DS

> One-sentence summary.

## Docs

- [Quickstart](https://acme.dev/quickstart): Start here.
`;

const MISSING_H1 = `Welcome to Acme DS.

> A token-first React design system.

## Docs

- [Quickstart](https://acme.dev/quickstart): Start here.
`;

const MISSING_BLOCKQUOTE = `# Acme DS

A token-first React design system.

## Docs

- [Quickstart](https://acme.dev/quickstart): Start here.
`;

const MALFORMED_LINK = `# Acme DS

> Short summary.

## Docs

- [Quickstart](): Missing URL.
- [](https://acme.dev/api): Missing title.
`;

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-llms-txt-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule ai-surface/llms-txt-structure", () => {
  it("fixture #1 (no file): emits a single warning when llms.txt is absent", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
    expect(result.findings[0]?.axis).toBe("ai-surface");
    expect(result.findings[0]?.message).toContain("No llms.txt");
    expect(result.opportunities).toBe(1);
  });

  it("fixture #2 (valid full): emits 0 findings on a fully conformant llms.txt", async () => {
    writeFileSync(join(tmp, "llms.txt"), VALID_FULL);
    writeFileSync(join(tmp, "llms-full.txt"), "# Acme DS (full)\n\n> ...\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("fixture #3 (valid minimal): emits 0 findings on the minimum required shape", async () => {
    writeFileSync(join(tmp, "llms.txt"), VALID_MINIMAL);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("fixture #4 (missing H1): emits an error when there is no `# <title>` heading", async () => {
    writeFileSync(join(tmp, "llms.txt"), MISSING_H1);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("H1"))).toBe(true);
  });

  it("fixture #5 (missing blockquote): emits an error when the summary blockquote is absent", async () => {
    writeFileSync(join(tmp, "llms.txt"), MISSING_BLOCKQUOTE);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("blockquote"))).toBe(true);
  });

  it("emits errors for section links missing title or URL", async () => {
    writeFileSync(join(tmp, "llms.txt"), MALFORMED_LINK);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.some((f) => f.message.toLowerCase().includes("url"))).toBe(true);
    expect(errors.some((f) => f.message.toLowerCase().includes("title"))).toBe(true);
  });

  it("emits an error when no `## <section>` heading is present (only H1 + blockquote)", async () => {
    writeFileSync(join(tmp, "llms.txt"), "# Acme DS\n\n> A small design system.\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("## <section>"))).toBe(true);
  });

  it("does not emit a missing-H1 error on a BOM-prefixed file (VSCode/Notepad)", async () => {
    writeFileSync(join(tmp, "llms.txt"), "﻿# Acme DS\n\n> A small design system.\n\n## Docs\n\n- [Quickstart](https://acme.test/start): how to start.\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("missing a top-level"))).toBe(false);
    expect(errors.some((f) => f.message.includes("blockquote"))).toBe(false);
  });

  it("does not emit when README contains the lyse-disable directive", async () => {
    writeFileSync(
      join(tmp, "README.md"),
      "# Acme\n\n<!-- lyse-disable ai-surface/llms-txt-structure -->\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("does not emit when repoRoot is missing", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("_internal helpers", () => {
  it("analyseStructure detects all parts on a valid file", () => {
    const report = _internal.analyseStructure(VALID_FULL);
    expect(report.hasH1).toBe(true);
    expect(report.hasBlockquote).toBe(true);
    expect(report.hasSection).toBe(true);
    expect(report.malformedLinks).toHaveLength(0);
  });

  it("analyseStructure flags malformed link rows with their line numbers", () => {
    const report = _internal.analyseStructure(MALFORMED_LINK);
    expect(report.malformedLinks.length).toBeGreaterThanOrEqual(2);
    for (const issue of report.malformedLinks) {
      expect(issue.line).toBeGreaterThan(0);
    }
  });

  it("analyseStructure marks blockquote absent when only an H1 is present", () => {
    const report = _internal.analyseStructure("# Title\n\nNo summary line.\n");
    expect(report.hasH1).toBe(true);
    expect(report.hasBlockquote).toBe(false);
  });
});
