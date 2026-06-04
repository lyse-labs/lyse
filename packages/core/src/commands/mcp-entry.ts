import { realpathSync } from "node:fs";
import { sep } from "node:path";

export interface McpEntry {
  command: string;
  args: string[];
}

/**
 * Options for resolving the MCP entry.
 *
 * - `argv1` undefined (or omitted) → falls back to `process.argv[1]`.
 *   This is the documented default.
 * - `argv1: ""` → treated as "no argv1 available" → forces dev mode.
 *   Useful in tests and unusual runtime contexts (e.g. embedded).
 * - `argv1: "/abs/path"` → used as-is (subject to realpath).
 * - `dev: true` → forces dev mode regardless of argv1. Escape hatch
 *   for fork checkouts that happen to live under a `node_modules/`
 *   ancestor (rare).
 */
export interface ResolveOptions {
  argv1?: string;
  dev?: boolean;
}

export type InstallMode = "npm" | "dev";

interface ResolutionContext {
  mode: InstallMode;
  resolved: string;
}

function tryRealpath(p: string): string {
  if (!p) return p;
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function resolve(opts: ResolveOptions): ResolutionContext {
  const argv1 = opts.argv1 ?? process.argv[1] ?? "";
  if (opts.dev === true) {
    return { mode: "dev", resolved: tryRealpath(argv1) };
  }
  if (!argv1) {
    return { mode: "dev", resolved: "" };
  }
  const resolved = tryRealpath(argv1);
  const mode: InstallMode = resolved.includes(`${sep}node_modules${sep}`)
    ? "npm"
    : "dev";
  return { mode, resolved };
}

/**
 * Detects whether the running Lyse process was launched from an npm
 * install (under a `node_modules/` ancestor after realpath resolution)
 * or from a local dev build.
 *
 * @returns `"npm"` if the resolved argv1 contains a `/node_modules/`
 *   path segment; otherwise `"dev"`. Forced to `"dev"` if `opts.dev`
 *   is `true` or argv1 is missing/empty. See ResolveOptions for input
 *   semantics.
 */
export function detectInstallMode(opts: ResolveOptions = {}): InstallMode {
  return resolve(opts).mode;
}

export function resolveLyseMcpEntry(opts: ResolveOptions = {}): McpEntry {
  const { mode, resolved } = resolve(opts);
  if (mode === "npm") {
    return { command: "npx", args: ["-y", "@lyse-labs/lyse", "mcp"] };
  }
  return { command: "node", args: [resolved, "mcp"] };
}
