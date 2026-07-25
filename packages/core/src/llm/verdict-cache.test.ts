import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findingContentHash, tokenContextHash, verdictKey, axisForTargetRule, VerdictCache } from "./verdict-cache.js";
import type { VerdictEntry } from "./verdict-cache.js";
import type { Finding } from "../types.js";
import type { DesignSystemGraph } from "../graph/types.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
    location: { file: "src/App.tsx", line: 3, column: 5 },
    message: "Hardcoded color value: #5865f2",
    fixGroup: { key: "k", from: "#5865f2" },
    ...over,
  } as Finding;
}
function graph(tokens: DesignSystemGraph["tokens"]): DesignSystemGraph {
  return { schemaVersion: 1, tokens, components: [], stories: [], usage: [],
    zones: { byFile: {} }, extraction: { entries: [], conflicts: [] } };
}
const G = graph([{ id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }]);

describe("axisForTargetRule", () => {
  it("maps the two target rules, null otherwise", () => {
    expect(axisForTargetRule("tokens/no-hardcoded-color")).toBe("colors");
    expect(axisForTargetRule("tokens/no-hardcoded-spacing")).toBe("spacing");
    expect(axisForTargetRule("a11y/essentials")).toBeNull();
  });
});

describe("findingContentHash — reformat-proof, per-value", () => {
  it("is identical when only line/column change (reformat)", () => {
    expect(findingContentHash(finding({ location: { file: "src/App.tsx", line: 3, column: 5 } })))
      .toBe(findingContentHash(finding({ location: { file: "src/App.tsx", line: 99, column: 1 } })));
  });
  it("changes when the file changes (literal moved)", () => {
    expect(findingContentHash(finding({ location: { file: "src/Other.tsx", line: 3, column: 5 } })))
      .not.toBe(findingContentHash(finding()));
  });
  it("changes when the value changes", () => {
    expect(findingContentHash(finding({ fixGroup: { key: "k", from: "#ff00aa" } })))
      .not.toBe(findingContentHash(finding()));
  });
});

describe("tokenContextHash — axis-scoped", () => {
  it("changes when a token OF THAT axis changes", () => {
    const g2 = graph([{ id: "color.brand", axis: "colors", rawValue: "#2563eb", source: "dtcg" }]);
    expect(tokenContextHash(g2, "colors")).not.toBe(tokenContextHash(G, "colors"));
  });
  it("does NOT change when a token of ANOTHER axis changes", () => {
    const g2 = graph([...G.tokens, { id: "space.md", axis: "spacing", rawValue: "16", source: "dtcg" }]);
    expect(tokenContextHash(g2, "colors")).toBe(tokenContextHash(G, "colors"));
  });
  it("is order-independent", () => {
    const a = graph([{ id: "a", axis: "colors", rawValue: "#111", source: "dtcg" }, { id: "b", axis: "colors", rawValue: "#222", source: "dtcg" }]);
    const b = graph([{ id: "b", axis: "colors", rawValue: "#222", source: "dtcg" }, { id: "a", axis: "colors", rawValue: "#111", source: "dtcg" }]);
    expect(tokenContextHash(a, "colors")).toBe(tokenContextHash(b, "colors"));
  });
});

describe("verdictKey", () => {
  it("combines both hashes for a target rule", () => {
    expect(verdictKey(finding(), G)).toBe(`${findingContentHash(finding())}:${tokenContextHash(G, "colors")}`);
  });
  it("is null for a non-target rule", () => {
    expect(verdictKey(finding({ ruleId: "a11y/essentials" }), G)).toBeNull();
  });
});

describe("VerdictCache", () => {
  const ENTRY_B: VerdictEntry = { key: "b-key", verdict: "violation", confidence: 0.9, model: "gpt-4o-mini" };
  const ENTRY_A: VerdictEntry = { key: "a-key", verdict: "fp", confidence: 0.5, model: "gpt-4o-mini" };

  function withTempRepo(fn: (repoRoot: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "lyse-verdict-"));
    try {
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("(a) serialize() is byte-stable across two calls and sorts entries by key", () => {
    withTempRepo((repoRoot) => {
      const cache = VerdictCache.load(repoRoot);
      cache.record(ENTRY_B);
      cache.record(ENTRY_A);
      const s1 = cache.serialize();
      const s2 = cache.serialize();
      expect(s1).toBe(s2);
      expect(s1.endsWith("\n")).toBe(true);
      const parsed = JSON.parse(s1) as { schemaVersion: number; verdicts: VerdictEntry[] };
      expect(parsed.verdicts.map((v) => v.key)).toEqual(["a-key", "b-key"]);
    });
  });

  it("(b) load on a missing file returns an empty cache; lookup is undefined", () => {
    withTempRepo((repoRoot) => {
      const cache = VerdictCache.load(repoRoot);
      expect(cache.lookup("anything")).toBeUndefined();
      expect(cache.dirty()).toBe(false);
    });
  });

  it("(c) load on a corrupt (non-JSON) file returns an empty cache, no throw", () => {
    withTempRepo((repoRoot) => {
      mkdirSync(join(repoRoot, ".lyse"), { recursive: true });
      writeFileSync(join(repoRoot, ".lyse", "verdicts.json"), "{ not json");
      expect(() => VerdictCache.load(repoRoot)).not.toThrow();
      const cache = VerdictCache.load(repoRoot);
      expect(cache.lookup("anything")).toBeUndefined();
    });
  });

  it("(c2) load on a structurally invalid file (valid JSON, wrong shape) returns an empty cache", () => {
    withTempRepo((repoRoot) => {
      mkdirSync(join(repoRoot, ".lyse"), { recursive: true });
      writeFileSync(
        join(repoRoot, ".lyse", "verdicts.json"),
        JSON.stringify({ schemaVersion: 2, verdicts: [{ key: "x" }] }),
      );
      const cache = VerdictCache.load(repoRoot);
      expect(cache.lookup("x")).toBeUndefined();
    });
  });

  it("(d) commit-safety: serialize() never contains source text, only hashed keys", () => {
    withTempRepo((repoRoot) => {
      const f = finding();
      const key = verdictKey(f, G);
      expect(key).not.toBeNull();
      const cache = VerdictCache.load(repoRoot);
      cache.record({ key: key!, verdict: "violation", confidence: 0.87, model: "gpt-4o-mini" });
      const serialized = cache.serialize();
      expect(serialized).not.toContain("#5865f2");
      expect(serialized).not.toContain("App.tsx");
      expect(serialized).not.toContain("Hardcoded");
      expect(serialized).toContain(key!);
      expect(serialized).toContain("violation");
    });
  });

  it("(e) round-trip: load after flush returns the recorded entry", () => {
    withTempRepo((repoRoot) => {
      const cache = VerdictCache.load(repoRoot);
      cache.record(ENTRY_A);
      cache.flush(repoRoot);
      const reloaded = VerdictCache.load(repoRoot);
      expect(reloaded.lookup(ENTRY_A.key)).toEqual(ENTRY_A);
    });
  });

  it("flush is a no-op when not dirty — a load-then-flush replay leaves the file byte-untouched", () => {
    withTempRepo((repoRoot) => {
      const cache = VerdictCache.load(repoRoot);
      cache.record(ENTRY_A);
      cache.flush(repoRoot);
      const path = join(repoRoot, ".lyse", "verdicts.json");
      const before = readFileSync(path, "utf8");

      const replay = VerdictCache.load(repoRoot);
      expect(replay.dirty()).toBe(false);
      replay.flush(repoRoot);

      expect(readFileSync(path, "utf8")).toBe(before);
    });
  });

  it("flush resets dirty() to false after a successful write", () => {
    withTempRepo((repoRoot) => {
      const cache = VerdictCache.load(repoRoot);
      cache.record(ENTRY_A);
      expect(cache.dirty()).toBe(true);
      cache.flush(repoRoot);
      expect(cache.dirty()).toBe(false);
    });
  });

  it("record dedups by key — last write wins", () => {
    withTempRepo((repoRoot) => {
      const cache = VerdictCache.load(repoRoot);
      cache.record({ key: "dup", verdict: "fp", confidence: 0.1, model: "m1" });
      cache.record({ key: "dup", verdict: "violation", confidence: 0.99, model: "m2" });
      expect(cache.lookup("dup")).toEqual({ key: "dup", verdict: "violation", confidence: 0.99, model: "m2" });
      const parsed = JSON.parse(cache.serialize()) as { verdicts: VerdictEntry[] };
      expect(parsed.verdicts).toHaveLength(1);
    });
  });
});
