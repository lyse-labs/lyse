import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, LlmVerdict } from "../types.js";
import type { DesignSystemGraph, TokenAxis } from "../graph/types.js";
import { anchorKey } from "../diff/anchor.js";

export interface VerdictEntry { key: string; verdict: LlmVerdict; confidence: number; model: string; }
export interface VerdictCacheFile { schemaVersion: 1; verdicts: VerdictEntry[]; }

const TARGET_AXIS: Record<string, TokenAxis> = {
  "tokens/no-hardcoded-color": "colors",
  "tokens/no-hardcoded-spacing": "spacing",
};

export function axisForTargetRule(ruleId: string): TokenAxis | null {
  return TARGET_AXIS[ruleId] ?? null;
}

const NUL = String.fromCharCode(0);

export function findingContentHash(f: Finding): string {
  const k = anchorKey(f); // { file, rule, bucket } — no line/column
  return createHash("sha256").update([k.rule, k.file, k.bucket].join(NUL)).digest("hex");
}

export function tokenContextHash(graph: DesignSystemGraph, axis: TokenAxis): string {
  const rows = graph.tokens
    .filter((t) => t.axis === axis)
    .map((t) => `${t.id}${NUL}${t.rawValue}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

export function verdictKey(f: Finding, graph: DesignSystemGraph): string | null {
  const axis = axisForTargetRule(String(f.ruleId));
  if (axis === null) return null;
  return `${findingContentHash(f)}:${tokenContextHash(graph, axis)}`;
}

const VERDICT_VALUES: readonly LlmVerdict[] = ["violation", "fp", "uncertain"];

function isValidVerdictEntry(v: unknown): v is VerdictEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.key === "string" &&
    typeof e.verdict === "string" &&
    (VERDICT_VALUES as readonly string[]).includes(e.verdict) &&
    typeof e.confidence === "number" &&
    typeof e.model === "string"
  );
}

function isValidCacheFile(raw: unknown): raw is VerdictCacheFile {
  if (typeof raw !== "object" || raw === null) return false;
  const f = raw as Record<string, unknown>;
  return f.schemaVersion === 1 && Array.isArray(f.verdicts) && f.verdicts.every(isValidVerdictEntry);
}

function verdictCachePath(repoRoot: string): string {
  return join(repoRoot, ".lyse", "verdicts.json");
}

function byKey(a: VerdictEntry, b: VerdictEntry): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * On-disk lockfile of LLM verdicts (`.lyse/verdicts.json`), safe to commit:
 * entries carry only hashed keys, never source text. `load` never throws —
 * any missing/corrupt/malformed file degrades to an empty cache so a broken
 * lockfile never breaks the audit.
 */
export class VerdictCache {
  private isDirty = false;

  private constructor(private readonly entries: Map<string, VerdictEntry>) {}

  static load(repoRoot: string): VerdictCache {
    try {
      const path = verdictCachePath(repoRoot);
      if (!existsSync(path)) return new VerdictCache(new Map());
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (!isValidCacheFile(raw)) return new VerdictCache(new Map());
      return new VerdictCache(new Map(raw.verdicts.map((entry) => [entry.key, entry] as const)));
    } catch {
      return new VerdictCache(new Map());
    }
  }

  lookup(key: string): VerdictEntry | undefined {
    return this.entries.get(key);
  }

  record(entry: VerdictEntry): void {
    this.entries.set(entry.key, entry);
    this.isDirty = true;
  }

  dirty(): boolean {
    return this.isDirty;
  }

  serialize(): string {
    const file: VerdictCacheFile = {
      schemaVersion: 1,
      verdicts: [...this.entries.values()].sort(byKey),
    };
    return JSON.stringify(file, null, 2) + "\n";
  }

  flush(repoRoot: string): void {
    if (!this.dirty()) return;
    const dir = join(repoRoot, ".lyse");
    mkdirSync(dir, { recursive: true });
    writeFileSync(verdictCachePath(repoRoot), this.serialize());
    this.isDirty = false;
  }
}
