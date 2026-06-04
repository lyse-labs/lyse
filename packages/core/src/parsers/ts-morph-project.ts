import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Project, SourceFile } from "ts-morph";

const require = createRequire(import.meta.url);

/**
 * Lazy `ts-morph` Project wrapper.
 *
 * SWC (the primary TS parser used by Lyse) has no semantic resolution, which
 * makes some confidence-classification questions hard to answer — e.g.
 * "is this file a design-token definition file?" requires reading the
 * source file's exported declarations and inspecting their initializers.
 *
 * `ts-morph` (TypeScript Compiler API wrapper) gives us that capability,
 * but it is heavyweight: instantiating a `Project` and loading the
 * tsconfig takes ~100-300 ms. We therefore lazy-load a single shared
 * Project per audit run and cache it module-level.
 *
 * Usage:
 *
 *   const tsm = getTsMorphProject(ctx.repoRoot);
 *   const sf = tsm.getSourceFile(absolutePath);
 *   if (sf) {
 *     // inspect exports, imports, declarations…
 *   }
 *
 * Tests that need to reset the cache between runs should call `clear()`.
 */

let cachedProject: Project | null = null;

export interface LyseTsMorphProject {
  /**
   * Returns a `SourceFile` for `absolutePath`, either from cache or by
   * adding it to the project on demand. Returns `undefined` if the file
   * cannot be added (missing, malformed, etc.).
   */
  getSourceFile(absolutePath: string): SourceFile | undefined;
  /**
   * Drops the cached `Project`. Intended for tests; production code does
   * not need to call this — the cache lives for the duration of one CLI
   * invocation.
   */
  clear(): void;
}

const TSCONFIG_CANDIDATES = ["tsconfig.json", "tsconfig.lyse.json"];

// We resolve the `ts-morph` `Project` constructor lazily via `require` on the
// first call to `getTsMorphProject`. Top-level static imports would force the
// 8 MB dependency into the cold-start path of every `lyse` invocation
// (including `lyse explain`, which never touches semantic analysis), adding
// ~200 ms of startup latency for zero benefit.
let projectCtor: (new (opts: unknown) => Project) | null = null;
function loadProjectCtor(): new (opts: unknown) => Project {
  if (projectCtor) return projectCtor;
  const mod = require("ts-morph") as { Project: new (opts: unknown) => Project };
  projectCtor = mod.Project;
  return projectCtor;
}

export function getTsMorphProject(repoRoot: string): LyseTsMorphProject {
  if (cachedProject) {
    return wrap(cachedProject);
  }
  const tsconfigPath = TSCONFIG_CANDIDATES
    .map((c) => join(repoRoot, c))
    .find(existsSync);

  const Ctor = loadProjectCtor();
  cachedProject = new Ctor({
    ...(tsconfigPath !== undefined ? { tsConfigFilePath: tsconfigPath } : {}),
    skipAddingFilesFromTsConfig: tsconfigPath === undefined,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noEmit: true },
  });
  return wrap(cachedProject);
}

function wrap(p: Project): LyseTsMorphProject {
  return {
    getSourceFile(absolutePath: string): SourceFile | undefined {
      const existing = p.getSourceFile(absolutePath);
      if (existing) return existing;
      try {
        return p.addSourceFileAtPath(absolutePath);
      } catch {
        return undefined;
      }
    },
    clear(): void {
      cachedProject = null;
    },
  };
}
