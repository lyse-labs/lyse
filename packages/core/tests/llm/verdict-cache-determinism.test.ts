/**
 * Load-bearing determinism + key-stability tests for the verdict cache.
 *
 * The feature's central claim: once every finding in a run is a cache hit,
 * replaying the run is byte-identical and NEVER touches the LLM connector.
 * Group 1 proves that with a connector that THROWS if called — a real
 * sentinel, not just a call-count assertion — so any regression that lets a
 * warm-cache run fall through to a live call fails loudly, not silently.
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFilterStage } from "../../src/llm/filter-stage.js";
import { VerdictCache, verdictKey } from "../../src/llm/verdict-cache.js";
import type { Finding, LyseConfig } from "../../src/types.js";
import type { DesignSystemGraph } from "../../src/graph/types.js";
import type { ChatMessage, ConnectorClient, ConnectorResult, CompleteOptions } from "../../src/llm/connectors/types.js";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const MIN_CONFIG: LyseConfig = {};

function graph(tokens: DesignSystemGraph["tokens"]): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens,
    components: [],
    stories: [],
    usage: [],
    zones: { byFile: {} },
    extraction: { entries: [], conflicts: [] },
  };
}

const GRAPH: DesignSystemGraph = graph([
  { id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" },
  { id: "space.md", axis: "spacing", rawValue: "16px", source: "dtcg" },
]);

function colorFinding(opts: { from: string; file?: string; line?: number }): Finding {
  const file = opts.file ?? "src/App.tsx";
  const line = opts.line ?? 1;
  return {
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens",
    severity: "warning",
    location: { file, line, column: 1 },
    message: `Hardcoded color value: ${opts.from}`,
    fixGroup: { key: `tokens/no-hardcoded-color::${opts.from}`, from: opts.from },
  } as Finding;
}

function spacingFinding(opts: { from: string; file?: string; line?: number }): Finding {
  const file = opts.file ?? "src/App.tsx";
  const line = opts.line ?? 1;
  return {
    ruleId: "tokens/no-hardcoded-spacing",
    axis: "tokens",
    severity: "warning",
    location: { file, line, column: 1 },
    message: `Hardcoded spacing value: ${opts.from}`,
    fixGroup: { key: `tokens/no-hardcoded-spacing::${opts.from}`, from: opts.from },
  } as Finding;
}

/** A connector that throws if `complete` is ever invoked — a genuine sentinel. */
function throwingConnector(): { connector: ConnectorClient; complete: ReturnType<typeof vi.fn> } {
  const complete = vi.fn(async (): Promise<ConnectorResult> => {
    throw new Error("connector must not be called on a fully warm cache");
  });
  return { connector: { complete }, complete };
}

/** A non-throwing Noop connector: returns an empty-text bail response. */
function noopConnector(): { connector: ConnectorClient; complete: ReturnType<typeof vi.fn> } {
  const complete = vi.fn(
    async (_messages: ChatMessage[], _opts?: CompleteOptions): Promise<ConnectorResult> => ({
      text: "",
      usdSpent: 0,
      modelUsed: "none",
      llmQuality: "lower",
      cacheHit: false,
    }),
  );
  return { connector: { complete }, complete };
}

function keyOf(f: Finding, g: DesignSystemGraph = GRAPH): string {
  const k = verdictKey(f, g);
  if (k === null) throw new Error("expected a non-null verdictKey for a target-rule finding");
  return k;
}

const tmpDirs: string[] = [];
function freshRepoRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-det-"));
  tmpDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Group 1 — Replay determinism (THE load-bearing test)
// ---------------------------------------------------------------------------

describe("verdict cache — replay determinism (fully warm, at runFilterStage level)", () => {
  const dropColor = colorFinding({ from: "#aaaaaa", line: 1 }); // seeded fp → must drop
  const keepColor = colorFinding({ from: "#bbbbbb", line: 2 }); // seeded violation → must keep + judgement
  const dropSpacing = spacingFinding({ from: "13px", line: 3 }); // seeded fp → must drop
  const keepSpacing = spacingFinding({ from: "17px", line: 4 }); // seeded violation → must keep + judgement

  const findings: Finding[] = [dropColor, keepColor, dropSpacing, keepSpacing];
  const fileContents = new Map([["src/App.tsx", "irrelevant source — the cache is fully warm"]]);

  function seededCache(repoRoot: string): VerdictCache {
    const cache = VerdictCache.load(repoRoot);
    cache.record({ key: keyOf(dropColor), verdict: "fp", confidence: 0.9, model: "test-model" });
    cache.record({ key: keyOf(keepColor), verdict: "violation", confidence: 0.9, model: "test-model" });
    cache.record({ key: keyOf(dropSpacing), verdict: "fp", confidence: 0.9, model: "test-model" });
    cache.record({ key: keyOf(keepSpacing), verdict: "violation", confidence: 0.9, model: "test-model" });
    return cache;
  }

  async function runOnce() {
    const repoRoot = freshRepoRoot();
    const cache = seededCache(repoRoot);
    const { connector, complete } = throwingConnector();
    const result = await runFilterStage(
      {
        repoRoot,
        config: MIN_CONFIG,
        flags: { llmConsented: true },
        findings,
        fileContents,
        graph: GRAPH,
      },
      { connector, cache },
    );
    return { result, complete };
  }

  it("(a) two independent runs produce byte-identical JSON output", async () => {
    const run1 = await runOnce();
    const run2 = await runOnce();

    const json1 = JSON.stringify(run1.result.findings);
    const json2 = JSON.stringify(run2.result.findings);
    expect(json1).toBe(json2);

    // Stable expected shape: the two "fp" findings are gone; the two
    // "violation" findings survive, each carrying the cached judgement.
    const kept = run1.result.findings.map((f) => ({
      from: f.fixGroup?.from,
      llmJudgement: f.llmJudgement,
    }));
    expect(kept).toEqual([
      { from: "#bbbbbb", llmJudgement: { verdict: "violation", confidence: 0.9 } },
      { from: "17px", llmJudgement: { verdict: "violation", confidence: 0.9 } },
    ]);
  });

  it("(b) the connector — a throwing sentinel — is never called (fully-warm path `continue`s before reaching it)", async () => {
    const { complete: complete1 } = await runOnce();
    const { complete: complete2 } = await runOnce();
    expect(complete1).toHaveBeenCalledTimes(0);
    expect(complete2).toHaveBeenCalledTimes(0);
  });

  it("(c) the dropped/kept partition matches the seeded verdicts exactly", async () => {
    const { result } = await runOnce();
    const survivingFroms = new Set(result.findings.map((f) => f.fixGroup?.from));
    expect(survivingFroms.has("#aaaaaa")).toBe(false); // seeded fp → dropped
    expect(survivingFroms.has("13px")).toBe(false); // seeded fp → dropped
    expect(survivingFroms.has("#bbbbbb")).toBe(true); // seeded violation → kept
    expect(survivingFroms.has("17px")).toBe(true); // seeded violation → kept
    expect(result.meta.filteredCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Group 2 — graph-absent / opt-in gating sanity
// ---------------------------------------------------------------------------

describe("verdict cache — opt-in gating sanity", () => {
  it("graph present but NOT opted-in (no llmConsented/llmFrozen/llmRefresh): the seeded cache has zero effect", async () => {
    const repoRoot = freshRepoRoot();
    const f = colorFinding({ from: "#aaaaaa", line: 1 });
    const cache = VerdictCache.load(repoRoot);
    // Pre-seed a hit that WOULD drop the finding if the cache were consulted.
    cache.record({ key: keyOf(f), verdict: "fp", confidence: 0.95, model: "seed" });

    const { connector, complete } = noopConnector(); // non-throwing: opt-out path may legitimately call it
    const fileContents = new Map([["src/App.tsx", "const a = red;"]]);

    const result = await runFilterStage(
      {
        repoRoot,
        config: MIN_CONFIG,
        flags: {}, // no opt-in
        findings: [f],
        fileContents,
        graph: GRAPH,
      },
      { connector, cache },
    );

    // The seeded "fp" hit had zero effect: the finding is still present, no judgement.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.fixGroup?.from).toBe("#aaaaaa");
    expect(result.findings[0]?.llmJudgement).toBeUndefined();
    // The pre-seeded entry itself is untouched (cache never consulted by the stage).
    expect(cache.lookup(keyOf(f))).toEqual({ key: keyOf(f), verdict: "fp", confidence: 0.95, model: "seed" });
    void complete; // not asserted on call count here — this test's claim is about cache inertness, not connector calls
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Key stability (reformat-proof / axis-scoped consequences)
// ---------------------------------------------------------------------------

describe("verdict cache — key stability", () => {
  it("reformat invariance: same value, different line in the same file ⇒ same verdictKey ⇒ still a hit (zero connector calls)", async () => {
    const repoRoot = freshRepoRoot();
    const original = colorFinding({ from: "#5865f2", file: "src/App.tsx", line: 3 });
    const reformatted = colorFinding({ from: "#5865f2", file: "src/App.tsx", line: 99 });
    expect(keyOf(reformatted)).toBe(keyOf(original));

    const cache = VerdictCache.load(repoRoot);
    cache.record({ key: keyOf(original), verdict: "fp", confidence: 0.9, model: "test-model" });

    const { connector, complete } = throwingConnector();
    const fileContents = new Map([["src/App.tsx", "irrelevant"]]);

    const result = await runFilterStage(
      {
        repoRoot,
        config: MIN_CONFIG,
        flags: { llmConsented: true },
        findings: [original, reformatted],
        fileContents,
        graph: GRAPH,
      },
      { connector, cache },
    );

    expect(result.findings).toHaveLength(0); // both dropped
    expect(complete).toHaveBeenCalledTimes(0);
  });

  it("moved to a new file ⇒ different verdictKey ⇒ miss (uncached); --llm-frozen reports meta.frozenMisses > 0", async () => {
    const repoRoot = freshRepoRoot();
    const original = colorFinding({ from: "#5865f2", file: "src/App.tsx", line: 3 });
    const moved = colorFinding({ from: "#5865f2", file: "src/Other.tsx", line: 3 });
    expect(keyOf(moved)).not.toBe(keyOf(original));

    const cache = VerdictCache.load(repoRoot);
    cache.record({ key: keyOf(original), verdict: "fp", confidence: 0.9, model: "test-model" });

    const { connector, complete } = throwingConnector(); // frozen never calls it either
    const fileContents = new Map([["src/Other.tsx", "irrelevant"]]);

    const result = await runFilterStage(
      {
        repoRoot,
        config: MIN_CONFIG,
        flags: { llmFrozen: true },
        findings: [moved],
        fileContents,
        graph: GRAPH,
      },
      { connector, cache },
    );

    expect(result.meta.frozenMisses).toBeGreaterThan(0);
    expect(complete).toHaveBeenCalledTimes(0);
    // Frozen keeps an unjudged miss rather than dropping it.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.llmJudgement).toBeUndefined();
  });

  it("colour token change ⇒ tokenContextHash changes ⇒ verdictKey for a colour finding differs", () => {
    const f = colorFinding({ from: "#5865f2", file: "src/App.tsx", line: 3 });
    const graphBefore = GRAPH;
    const graphAfterColorChange = graph([
      { id: "color.brand", axis: "colors", rawValue: "#2563eb", source: "dtcg" }, // changed
      { id: "space.md", axis: "spacing", rawValue: "16px", source: "dtcg" },
    ]);
    expect(verdictKey(f, graphAfterColorChange)).not.toBe(verdictKey(f, graphBefore));
  });

  it("unrelated edit (a spacing token change) does NOT change a colour finding's verdictKey", () => {
    const f = colorFinding({ from: "#5865f2", file: "src/App.tsx", line: 3 });
    const graphBefore = GRAPH;
    const graphAfterSpacingChange = graph([
      { id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }, // unchanged
      { id: "space.md", axis: "spacing", rawValue: "20px", source: "dtcg" }, // changed, different axis
    ]);
    expect(verdictKey(f, graphAfterSpacingChange)).toBe(verdictKey(f, graphBefore));
  });
});
