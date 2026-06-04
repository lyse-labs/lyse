import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";
import fg from "fast-glob";
import type { CanonicalSample, CanonicalSamplesBlock } from "./types.js";

const COMPONENT_DIRS = ["**/components/**", "**/ui/**", "packages/*/src/**"];
const COMPONENT_EXTS = "{ts,tsx,js,jsx}";

const PASCAL_SINGLE_WORD = /^[A-Z][a-z]+\.(tsx|ts|jsx|js)$/;
const LAYOUT_HINTS = /(layout|flex|grid|stack|cluster|box)/i;
const FORM_HINTS = /(input|select|field|form|textfield|combobox)/i;
const TOKEN_HINTS = /(tokens?|theme|palette|design-tokens)/i;
const CONFIG_FILES = new Set(["tsconfig.json", "package.json", "eslint.config.js", "eslint.config.mjs", "vite.config.ts", "vitest.config.ts"]);

async function loadSample(repoRoot: string, relPath: string): Promise<CanonicalSample | null> {
  try {
    const buf = await readFile(join(repoRoot, relPath));
    const content = buf.toString("utf8");
    return {
      path: relPath,
      sha256: createHash("sha256").update(buf).digest("hex"),
      byteCount: buf.byteLength,
      content,
    };
  } catch {
    return null;
  }
}

function deterministicSort(samples: CanonicalSample[]): CanonicalSample[] {
  return [...samples].sort((a, b) => {
    if (a.byteCount !== b.byteCount) return a.byteCount - b.byteCount;
    return a.path.localeCompare(b.path);
  });
}

function take<T>(arr: ReadonlyArray<T>, n: number): T[] {
  return arr.slice(0, n);
}

export async function collectCanonicalSamples(repoRoot: string): Promise<CanonicalSamplesBlock> {
  const componentPaths = await fg(
    COMPONENT_DIRS.map((d) => `${d}/*.${COMPONENT_EXTS}`),
    {
      cwd: repoRoot,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.stories.*",
        "**/*.test.*",
        "**/*.spec.*",
        "**/.recall-suite-cache/**",
        "**/benchmarks/fixtures/**",
        "**/fixtures/**",
        "**/.tmp/**",
        "**/coverage/**",
      ],
      onlyFiles: true,
      unique: true,
    },
  );

  const allComponents: CanonicalSample[] = [];
  for (const rel of componentPaths.sort()) {
    const s = await loadSample(repoRoot, rel);
    if (s !== null) allComponents.push(s);
  }

  const primitives = allComponents.filter((c) => PASCAL_SINGLE_WORD.test(basename(c.path)));
  const layouts = allComponents.filter((c) => LAYOUT_HINTS.test(basename(c.path)));
  const forms = allComponents.filter((c) => FORM_HINTS.test(basename(c.path)));
  const compounds = allComponents.filter((c) => {
    const imports = c.content.match(/import\s+\{[^}]+\}\s+from\s+["']\.\/[A-Z]/g);
    return (imports?.length ?? 0) >= 2;
  });

  const storyPaths = await fg(["**/*.stories.{ts,tsx,js,jsx}"], {
    cwd: repoRoot,
    ignore: [
      "**/node_modules/**",
      "**/.recall-suite-cache/**",
      "**/benchmarks/fixtures/**",
      "**/fixtures/**",
      "**/.tmp/**",
      "**/coverage/**",
    ],
    onlyFiles: true,
  });
  const testPaths = await fg(["**/*.{test,spec}.{ts,tsx,js,jsx}"], {
    cwd: repoRoot,
    ignore: [
      "**/node_modules/**",
      "**/.recall-suite-cache/**",
      "**/benchmarks/fixtures/**",
      "**/fixtures/**",
      "**/.tmp/**",
      "**/coverage/**",
    ],
    onlyFiles: true,
  });
  const tokenPaths = (await fg(["**/*.{json,ts,js}"], {
    cwd: repoRoot,
    ignore: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.recall-suite-cache/**",
      "**/benchmarks/fixtures/**",
      "**/fixtures/**",
      "**/.tmp/**",
      "**/coverage/**",
    ],
    onlyFiles: true,
  })).filter((p) => TOKEN_HINTS.test(p));

  const stories: CanonicalSample[] = [];
  for (const rel of storyPaths.sort()) { const s = await loadSample(repoRoot, rel); if (s !== null) stories.push(s); }
  const tests: CanonicalSample[] = [];
  for (const rel of testPaths.sort()) { const s = await loadSample(repoRoot, rel); if (s !== null) tests.push(s); }
  const tokenFiles: CanonicalSample[] = [];
  for (const rel of tokenPaths.sort()) { const s = await loadSample(repoRoot, rel); if (s !== null) tokenFiles.push(s); }

  const configFiles: CanonicalSample[] = [];
  for (const candidate of CONFIG_FILES) {
    const s = await loadSample(repoRoot, candidate);
    if (s !== null) configFiles.push(s);
  }

  return {
    primitiveComponents: take(deterministicSort(primitives), 5),
    compoundComponents: take(deterministicSort(compounds), 5),
    layoutComponents: take(deterministicSort(layouts), 5),
    formComponents: take(deterministicSort(forms), 5),
    stories: take(deterministicSort(stories), 10),
    tests: take(deterministicSort(tests), 5),
    tokenFiles: take(deterministicSort(tokenFiles), 10),
    configFiles: deterministicSort(configFiles),
  };
}
