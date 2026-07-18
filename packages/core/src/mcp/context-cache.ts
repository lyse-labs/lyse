import { loadTokens } from "../loaders/tokens.js";
import { loadStories } from "../loaders/stories.js";
import { loadConfig } from "../config/schema.js";
import { buildGraphForRoot } from "../graph/build-io.js";
import type { LyseConfig, StoryIndex, TokenMap } from "../types.js";
import type { DesignSystemGraph } from "../graph/types.js";

/**
 * Repo-level context an `audit_file` call needs: the token registry, the story
 * index, and the parsed config. Loading these scans the whole project tree, so
 * on a Carbon-scale repo (~500 components) doing it on EVERY single-file audit
 * blows the MCP P95 budget. This cache reuses the context across calls within a
 * short TTL (the MCP hot path is a burst of audits on one project), bounding
 * staleness while keeping per-call cost flat.
 */
export interface ProjectContext {
  tokens: TokenMap | null;
  storyIndex: StoryIndex | null;
  config: LyseConfig;
  graph: DesignSystemGraph;
}

interface CacheEntry {
  value: ProjectContext;
  loadedAt: number;
}

export interface ContextCacheOptions {
  /**
   * Max age (ms) before a cached entry is reloaded. Bounds staleness if tokens
   * or config change mid-session. A watch daemon can pass a long TTL and call
   * {@link clearProjectContextCache} on filesystem events instead.
   */
  ttlMs: number;
}

const DEFAULT_TTL_MS = 2_000;
const cache = new Map<string, CacheEntry>();

async function loadProjectContext(projectRoot: string): Promise<ProjectContext> {
  const [tokens, storyIndex, graph] = await Promise.all([
    loadTokens(projectRoot),
    loadStories(projectRoot),
    buildGraphForRoot(projectRoot),
  ]);
  // degrade (not throw) on malformed config: a single-file audit must never
  // fail because of an unrelated .lyse.yaml error.
  const config = loadConfig(projectRoot, { onError: "degrade" });
  return { tokens, storyIndex, config, graph };
}

/**
 * Returns the (possibly cached) project context for `projectRoot`. Within the
 * TTL the exact same object is returned; otherwise it is reloaded. Concurrent
 * calls during a cold load are NOT deduped (kept simple) — the last write wins
 * and both callers get a valid context.
 */
export async function getProjectContext(
  projectRoot: string,
  opts: ContextCacheOptions = { ttlMs: DEFAULT_TTL_MS },
): Promise<ProjectContext> {
  const now = Date.now();
  const hit = cache.get(projectRoot);
  if (hit && now - hit.loadedAt < opts.ttlMs) {
    return hit.value;
  }
  const value = await loadProjectContext(projectRoot);
  cache.set(projectRoot, { value, loadedAt: Date.now() });
  return value;
}

/** Drops all cached contexts. Call on filesystem changes (watch daemon) or in tests. */
export function clearProjectContextCache(): void {
  cache.clear();
}

/** Number of cached project roots (test/diagnostic helper). */
export function _contextCacheSize(): number {
  return cache.size;
}
