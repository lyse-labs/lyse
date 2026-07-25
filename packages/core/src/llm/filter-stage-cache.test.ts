import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFilterStage } from "./filter-stage.js";
import { VerdictCache, verdictKey } from "./verdict-cache.js";
import type { ChatMessage, ConnectorClient, ConnectorResult } from "./connectors/types.js";
import type { Finding, LyseConfig } from "../types.js";
import type { DesignSystemGraph } from "../graph/types.js";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const MIN_CONFIG: LyseConfig = {};

const GRAPH: DesignSystemGraph = {
  schemaVersion: 1,
  tokens: [{ id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }],
  components: [],
  stories: [],
  usage: [],
  zones: { byFile: {} },
  extraction: { entries: [], conflicts: [] },
};

/**
 * `from` drives the verdictKey (via fixGroup.from) so distinct `from` values
 * partition into distinct cache keys. `message`/`context` are the marker text
 * we assert on inside the prompt's FINDINGS section (kept out of the source so
 * they can't leak in via the fenced file body).
 */
function colorFinding(opts: {
  from: string;
  line: number;
  message?: string;
  context?: string;
}): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens",
    severity: "warning",
    location: { file: "src/App.tsx", line: opts.line, column: 1 },
    message: opts.message ?? `Hardcoded color ${opts.from}`,
    context: opts.context ?? opts.from,
    fixGroup: { key: `tokens/no-hardcoded-color::${opts.from}`, from: opts.from },
  };
}

function fakeConnector(responseText: string): {
  connector: ConnectorClient;
  complete: ReturnType<typeof vi.fn>;
  prompts: string[];
} {
  const prompts: string[] = [];
  const complete = vi.fn(async (messages: ChatMessage[]): Promise<ConnectorResult> => {
    prompts.push(messages.map((m) => m.content).join("\n"));
    return {
      text: responseText,
      usdSpent: 0,
      modelUsed: "fake-model",
      llmQuality: "higher",
      cacheHit: false,
    };
  });
  return { connector: { complete }, complete, prompts };
}

async function withTempRepo(fn: (repoRoot: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "lyse-filter-cache-"));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function key(f: Finding): string {
  const k = verdictKey(f, GRAPH);
  if (k === null) throw new Error("expected a non-null verdictKey for a target-rule finding");
  return k;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runFilterStage — verdict cache", () => {
  it("full warm cache: applies cached verdicts and never calls the connector", async () => {
    await withTempRepo(async (repoRoot) => {
      const dropF = colorFinding({ from: "#aaaaaa", line: 1 }); // cached fp → dropped
      const keepF = colorFinding({ from: "#bbbbbb", line: 2 }); // cached violation → kept + judgement
      const cache = VerdictCache.load(repoRoot);
      cache.record({ key: key(dropF), verdict: "fp", confidence: 0.95, model: "seed" });
      cache.record({ key: key(keepF), verdict: "violation", confidence: 0.8, model: "seed" });

      const { connector, complete } = fakeConnector(
        JSON.stringify({ verdicts: [{ index: 0, verdict: "fp", confidence: 1 }] }),
      );
      const fileContents = new Map([["src/App.tsx", "line one\nline two"]]);

      const result = await runFilterStage(
        { repoRoot, config: MIN_CONFIG, flags: undefined, findings: [dropF, keepF], fileContents, graph: GRAPH },
        { connector, cache },
      );

      expect(complete).toHaveBeenCalledTimes(0);
      // The cached "fp" finding is gone from the result.
      expect(result.findings.find((f) => f.fixGroup?.from === "#aaaaaa")).toBeUndefined();
      // The cached "violation" finding is kept and carries the cached judgement.
      const kept = result.findings.find((f) => f.fixGroup?.from === "#bbbbbb");
      expect(kept?.llmJudgement).toEqual({ verdict: "violation", confidence: 0.8 });
      expect(result.meta.filteredCount).toBe(1);
    });
  });

  it("partial cache: sends only the miss and maps the verdict index into misses (not judgedFindings)", async () => {
    await withTempRepo(async (repoRoot) => {
      const hitF = colorFinding({ from: "#aaaaaa", line: 1, message: "HITMARKER", context: "hitctx" });
      const missF = colorFinding({ from: "#bbbbbb", line: 2, message: "MISSMARKER", context: "missctx" });
      const cache = VerdictCache.load(repoRoot);
      cache.record({ key: key(hitF), verdict: "violation", confidence: 0.7, model: "seed" });

      // Connector drops "index 0". If the code (wrongly) indexed judgedFindings,
      // index 0 = the HIT; correct code indexes misses, index 0 = the MISS.
      const { connector, complete, prompts } = fakeConnector(
        JSON.stringify({ verdicts: [{ index: 0, verdict: "fp", confidence: 0.9 }] }),
      );
      const fileContents = new Map([["src/App.tsx", "line one\nline two"]]);

      const result = await runFilterStage(
        { repoRoot, config: MIN_CONFIG, flags: undefined, findings: [hitF, missF], fileContents, graph: GRAPH },
        { connector, cache },
      );

      expect(complete).toHaveBeenCalledTimes(1);
      // Only the miss finding's markers are in the prompt; the hit is never re-sent.
      expect(prompts[0]).toContain("MISSMARKER");
      expect(prompts[0]).toContain("missctx");
      expect(prompts[0]).not.toContain("HITMARKER");
      expect(prompts[0]).not.toContain("hitctx");
      // Index-into-misses guard: the MISS (#bbbbbb) was dropped, the HIT (#aaaaaa) kept.
      expect(result.findings.find((f) => f.fixGroup?.from === "#bbbbbb")).toBeUndefined();
      const hitKept = result.findings.find((f) => f.fixGroup?.from === "#aaaaaa");
      expect(hitKept?.llmJudgement).toEqual({ verdict: "violation", confidence: 0.7 });
      // The live drop was canonicalised as "fp" and recorded.
      expect(cache.lookup(key(missF))).toEqual({
        key: key(missF),
        verdict: "fp",
        confidence: 0.9,
        model: "fake-model",
      });
    });
  });

  it("llmRefresh: ignores cached verdicts on read, re-judges, and rewrites the cache", async () => {
    await withTempRepo(async (repoRoot) => {
      const f = colorFinding({ from: "#aaaaaa", line: 1 });
      const cache = VerdictCache.load(repoRoot);
      // Cached verdict says "fp" (would drop). Refresh must ignore it.
      cache.record({ key: key(f), verdict: "fp", confidence: 0.9, model: "seed" });

      const { connector, complete } = fakeConnector(
        JSON.stringify({ verdicts: [{ index: 0, verdict: "violation", confidence: 0.6 }] }),
      );
      const fileContents = new Map([["src/App.tsx", "const a = red;"]]);

      const result = await runFilterStage(
        { repoRoot, config: MIN_CONFIG, flags: { llmRefresh: true }, findings: [f], fileContents, graph: GRAPH },
        { connector, cache },
      );

      expect(complete).toHaveBeenCalledTimes(1);
      // Cached fp ignored → live "violation" → finding kept with the fresh judgement.
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.llmJudgement).toEqual({ verdict: "violation", confidence: 0.6 });
      // Cache rewritten with the fresh verdict.
      expect(cache.lookup(key(f))).toEqual({
        key: key(f),
        verdict: "violation",
        confidence: 0.6,
        model: "fake-model",
      });
      expect(existsSync(join(repoRoot, ".lyse", "verdicts.json"))).toBe(true);
    });
  });

  it("llmFrozen: keeps misses, reports meta.frozenMisses, and never calls the connector", async () => {
    await withTempRepo(async (repoRoot) => {
      const f = colorFinding({ from: "#aaaaaa", line: 1 });
      const cache = VerdictCache.load(repoRoot); // empty → f is a miss
      const { connector, complete } = fakeConnector(
        JSON.stringify({ verdicts: [{ index: 0, verdict: "fp", confidence: 1 }] }),
      );
      const fileContents = new Map([["src/App.tsx", "const a = red;"]]);

      const result = await runFilterStage(
        { repoRoot, config: MIN_CONFIG, flags: { llmFrozen: true }, findings: [f], fileContents, graph: GRAPH },
        { connector, cache },
      );

      expect(complete).toHaveBeenCalledTimes(0);
      expect(result.meta.frozenMisses).toBeGreaterThan(0);
      // The miss is kept (never dropped), no judgement attached.
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.fixGroup?.from).toBe("#aaaaaa");
      expect(result.findings[0]!.llmJudgement).toBeUndefined();
    });
  });

  it("records new verdicts from a miss and marks the cache dirty (flush writes)", async () => {
    await withTempRepo(async (repoRoot) => {
      const f = colorFinding({ from: "#aaaaaa", line: 1 });
      const cache = VerdictCache.load(repoRoot);
      const recordSpy = vi.spyOn(cache, "record");
      const dirtyAtFlush = vi.spyOn(cache, "flush");
      const { connector } = fakeConnector(
        JSON.stringify({ verdicts: [{ index: 0, verdict: "violation", confidence: 0.55 }] }),
      );
      const fileContents = new Map([["src/App.tsx", "const a = red;"]]);

      await runFilterStage(
        { repoRoot, config: MIN_CONFIG, flags: undefined, findings: [f], fileContents, graph: GRAPH },
        { connector, cache },
      );

      expect(recordSpy).toHaveBeenCalledWith({
        key: key(f),
        verdict: "violation",
        confidence: 0.55,
        model: "fake-model",
      });
      // record() marked the cache dirty; flush() then wrote the file (a no-op unless dirty).
      expect(dirtyAtFlush).toHaveBeenCalledWith(repoRoot);
      expect(existsSync(join(repoRoot, ".lyse", "verdicts.json"))).toBe(true);
      expect(cache.lookup(key(f))).toBeDefined();
    });
  });

  it("graph absent: no cache logic, filters live via the connector exactly as before", async () => {
    const f = colorFinding({ from: "#aaaaaa", line: 1 });
    const { connector, complete } = fakeConnector(
      JSON.stringify({ verdicts: [{ index: 0, verdict: "fp", confidence: 0.9 }] }),
    );
    const fileContents = new Map([["src/App.tsx", "const a = red;"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents }, // no graph
      { connector },
    );

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.findings).toHaveLength(0); // fp → dropped, unchanged behaviour
    expect(result.meta.frozenMisses).toBeUndefined();
  });
});
