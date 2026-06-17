import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTokens } from "../../src/loaders/tokens.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-token-src-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("loadTokens — Style Dictionary (value/type)", () => {
  it("ingests SD tokens into the right buckets", async () => {
    writeFileSync(join(tmp, "tokens.json"), JSON.stringify({
      color: { primary: { value: "#2563eb", type: "color" } },
      radius: { sm: { value: "4px", type: "borderRadius" } },
      space: { md: { value: "16px", type: "dimension" } },
      weight: { bold: { value: "700", type: "fontWeight" } },
    }));
    const tm = await loadTokens(tmp);
    expect(tm).not.toBeNull();
    expect(tm!.source).toBe("style-dictionary");
    expect(tm!.colors.has("#2563eb")).toBe(true);
    expect(tm!.radii.has("4px")).toBe(true);
    expect(tm!.spacing.has("16")).toBe(true);
    expect(tm!.typography.has("weight/700")).toBe(true);
  });
});

describe("loadTokens — Tokens Studio ($metadata/$themes + TS types)", () => {
  it("ingests TS tokens, strips wrappers + set names, maps TS type names", async () => {
    writeFileSync(join(tmp, "tokens.json"), JSON.stringify({
      $metadata: { tokenSetOrder: ["global"] },
      $themes: [],
      global: {
        color: { brand: { value: "#ff0000", type: "color" } },
        fontWeights: { bold: { value: "700", type: "fontWeights" } },
        spacing: { md: { value: "16px", type: "spacing" } },
        boxShadow: { sm: { value: { x: "0", y: "1", blur: "2", spread: "0", color: "#000000" }, type: "boxShadow" } },
      },
    }));
    const tm = await loadTokens(tmp);
    expect(tm).not.toBeNull();
    expect(tm!.source).toBe("tokens-studio");
    expect(tm!.colors.has("#ff0000")).toBe(true);
    expect(tm!.typography.has("weight/700")).toBe(true);
    expect(tm!.spacing.has("16")).toBe(true);
    expect([...tm!.shadows.keys()].some((s) => s.includes("#000000"))).toBe(true);
  });

  it("skips token references ({alias}) — only literal values are tokens", async () => {
    writeFileSync(join(tmp, "tokens.json"), JSON.stringify({
      $metadata: { tokenSetOrder: ["g"] },
      g: { color: { a: { value: "#abcdef", type: "color" }, b: { value: "{color.a}", type: "color" } } },
    }));
    const tm = await loadTokens(tmp);
    expect(tm!.colors.has("#abcdef")).toBe(true);
    expect(tm!.colors.has("{color.a}")).toBe(false);
  });
});

describe("loadTokens — source-discovery negatives", () => {
  it("a tokens.json that is not actually tokens yields no token map", async () => {
    writeFileSync(join(tmp, "tokens.json"), JSON.stringify({ name: "my-pkg", version: "1.0.0" }));
    expect(await loadTokens(tmp)).toBeNull();
  });
});
