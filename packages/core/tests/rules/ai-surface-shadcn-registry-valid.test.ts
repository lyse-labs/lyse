import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-surface-shadcn-registry-valid.js";
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
  tmp = mkdtempSync(join(tmpdir(), "lyse-shadcn-registry-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule ai-surface/shadcn-registry-valid", () => {
  it("emits no finding when neither components.json nor registry is present", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("emits a warning when components.json exists but no registry.json", async () => {
    writeFileSync(
      join(tmp, "components.json"),
      JSON.stringify({ $schema: "https://ui.shadcn.com/schema.json", style: "default" }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
    expect(result.findings[0]?.axis).toBe("ai-surface");
    expect(result.findings[0]?.message).toContain("missed");
    expect(result.opportunities).toBe(1);
  });

  it("emits no finding on a valid single-file registry.json (with content + multi-files)", async () => {
    writeFileSync(
      join(tmp, "registry.json"),
      JSON.stringify({
        $schema: "https://ui.shadcn.com/schema/registry.json",
        name: "button",
        type: "registry:ui",
        dependencies: ["@radix-ui/react-slot"],
        registryDependencies: ["utils"],
        files: [
          { path: "ui/button.tsx", content: "export const Button = () => null;", type: "registry:ui" },
          { path: "ui/button.css", content: ".btn {}" },
        ],
        tailwind: { config: { theme: { extend: {} } } },
        cssVars: { light: { "--primary": "0 0% 0%" }, dark: { "--primary": "0 0% 100%" } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("emits no finding on a valid minimal registry item", async () => {
    writeFileSync(
      join(tmp, "registry.json"),
      JSON.stringify({
        name: "button",
        type: "registry:ui",
        files: [{ path: "ui/button.tsx" }],
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("emits an error for malformed JSON", async () => {
    writeFileSync(join(tmp, "registry.json"), "{ not json,,");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]?.message).toContain("not valid JSON");
  });

  it("emits errors when required fields (name, type, files) are missing", async () => {
    writeFileSync(
      join(tmp, "registry.json"),
      JSON.stringify({ name: "button" }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("`type`"))).toBe(true);
    expect(errors.some((f) => f.message.includes("`files`"))).toBe(true);
  });

  it("emits an error when a `files` entry is missing `path`", async () => {
    writeFileSync(
      join(tmp, "registry.json"),
      JSON.stringify({
        name: "button",
        type: "registry:ui",
        files: [{ content: "no path here" }],
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("files[0]"))).toBe(true);
  });

  it("validates per-component registry/*.json files", async () => {
    mkdirSync(join(tmp, "registry"), { recursive: true });
    writeFileSync(
      join(tmp, "registry", "button.json"),
      JSON.stringify({ name: "button", type: "registry:ui", files: [{ path: "ui/button.tsx" }] }),
    );
    writeFileSync(
      join(tmp, "registry", "broken.json"),
      JSON.stringify({ name: "broken" }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]?.location.file).toContain("broken.json");
    expect(result.opportunities).toBe(2);
  });

  it("validates a `public/registry.json` (Next.js-style hosted registry)", async () => {
    mkdirSync(join(tmp, "public"), { recursive: true });
    writeFileSync(
      join(tmp, "public", "registry.json"),
      JSON.stringify({ name: "card", type: "registry:ui", files: [{ path: "ui/card.tsx" }] }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("validates a registry items collection (`items: [...]`)", async () => {
    writeFileSync(
      join(tmp, "registry.json"),
      JSON.stringify({
        items: [
          { name: "button", type: "registry:ui", files: [{ path: "ui/button.tsx" }] },
          { name: "card", type: "registry:ui", files: [{ path: "ui/card.tsx" }] },
        ],
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("accepts a non-standard `type` value (shadcn schema is permissive)", async () => {
    // shadcn's schema accepts arbitrary `registry:*` namespaces and has evolved
    // over time; hardcoding a fixed set of valid types caused false positives.
    writeFileSync(
      join(tmp, "registry.json"),
      JSON.stringify({ name: "button", type: "registry:custom", files: [{ path: "ui/button.tsx" }] }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("does not emit when repoRoot is missing", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("_internal helpers", () => {
  it("validateRegistryItem accepts a minimal valid item", () => {
    const res = _internal.validateRegistryItem({
      name: "button",
      type: "registry:ui",
      files: [{ path: "ui/button.tsx" }],
    });
    expect(res.ok).toBe(true);
    expect(res.reasons).toHaveLength(0);
  });

  it("validateRegistryItem rejects missing required fields", () => {
    expect(_internal.validateRegistryItem({}).ok).toBe(false);
    expect(_internal.validateRegistryItem(null).ok).toBe(false);
    expect(_internal.validateRegistryItem("string").ok).toBe(false);
  });

  it("validateRegistryItem rejects empty `files`", () => {
    const res = _internal.validateRegistryItem({ name: "x", type: "registry:ui", files: [] });
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.includes("empty"))).toBe(true);
  });

  it("looksLikeRegistryCollection detects `items` or `registry` arrays", () => {
    expect(_internal.looksLikeRegistryCollection({ items: [] })).toBe(true);
    expect(_internal.looksLikeRegistryCollection({ registry: [] })).toBe(true);
    expect(_internal.looksLikeRegistryCollection({ name: "x" })).toBe(false);
    expect(_internal.looksLikeRegistryCollection(null)).toBe(false);
  });
});
