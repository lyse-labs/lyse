/**
 * measure:tokens — how many tokens does Lyse see, and how many does the
 * repository actually define?
 *
 `graph/extract/tokens.ts#extractTokens` reads six things: a Tailwind v3
 * config, CSS `@theme`, DTCG `*.tokens.json`, style-dictionary JSON, CSS custom
 * properties written literally, and SCSS `$var` declarations. It does NOT read a
 * JS/TS token module — which is how Carbon (`packages/themes/src/g10.js`),
 * Chakra and Mantine define theirs — nor a Sass-composed name, which is why
 * `--el-*` is invisible on Element Plus.
 *
 * Measured through the real CLI, not through a loader in isolation: an earlier
 * version of this script called `loadTokens` directly and reported zero for ten
 * repositories, because `loadTokens` is only four of the six paths. The number
 * that matters is the one the product publishes.
 *
 *   pnpm measure:tokens
 *   pnpm measure:tokens --json
 *
 * The "defines" columns are deliberately crude — a count of declaration-shaped
 * lines, not a parse. They are a floor on what exists, not a target. A ratio of
 * 31 seen against 4000 declared is a finding whatever the exact denominator.
 */
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GOLDEN_CORPUS, type GoldenRepo } from "../packages/core/tests/golden/corpus.js";
import { GENERALIZATION_CORPUS } from "../packages/core/tests/generalization/corpus.js";
import { fetchGoldenRepo } from "../packages/core/tests/golden/fetch.js";

const CLI = resolve(
  dirname(fileURLToPath(import.meta.url)), "..", "packages", "core", "dist", "cli.js",
);

/** What the shipped product reports, via `meta.extraction`. */
function auditTokens(dir: string): { nodes: number; sources: number } | null {
  try {
    const out = execFileSync(process.execPath, [CLI, "audit", dir, "--json", "--static-only"], {
      encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    });
    const r = JSON.parse(out) as {
      meta?: { extraction?: { entries?: { extractor?: string; evidence?: Record<string, number> }[] } };
    };
    const e = r.meta?.extraction?.entries?.find((x) => x.extractor === "tokens");
    if (e?.evidence === undefined) return null;
    return { nodes: e.evidence["tokenNodes"] ?? 0, sources: e.evidence["tokenSources"] ?? 0 };
  } catch {
    return null;
  }
}

const AS_JSON = process.argv.includes("--json");

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage", "out"]);

/**
 * A plain recursive walk rather than fast-glob: that is a dependency of
 * `packages/core`, and a script at the workspace root cannot resolve it.
 */
async function filesWithExt(root: string, exts: ReadonlySet<string>): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(join(dir, e.name));
      } else if (e.isFile() && exts.has(extname(e.name)) && !e.name.includes(".min.")) {
        out.push(join(dir, e.name));
      }
    }
  }
  return out;
}

/** Sass/Less variable declarations: `$name:` / `@name:`, one per line. */
const SASS_DECL = /^\s*[$@][A-Za-z_][\w-]*\s*:/gm;
/** CSS custom properties written literally: `--name:`. */
const CSS_VAR_DECL = /^\s*--[A-Za-z_][\w-]*\s*:/gm;
/** A JS/TS object entry whose value is a colour, length or duration literal. */
const JS_TOKEN_ENTRY =
  /^\s*['"]?[\w$-]+['"]?\s*:\s*['"`](#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|-?[\d.]+(px|rem|em|ms|s)\b)/gm;

function countMatches(source: string, re: RegExp): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(source) !== null) n++;
  return n;
}

async function countIn(root: string, exts: readonly string[], re: RegExp): Promise<number> {
  const files = await filesWithExt(root, new Set(exts));
  let total = 0;
  for (const f of files) {
    try {
      total += countMatches(await readFile(f, "utf8"), re);
    } catch {
      continue;
    }
  }
  return total;
}

interface Row {
  repo: string;
  seen: number;
  sources: number;
  declaredSass: number;
  declaredCssVar: number;
  declaredJs: number;
}

function corpus(): GoldenRepo[] {
  const seen = new Set<string>();
  const out: GoldenRepo[] = [];
  for (const r of [...GOLDEN_CORPUS, ...GENERALIZATION_CORPUS]) {
    if (seen.has(r.label)) continue;
    seen.add(r.label);
    out.push(r);
  }
  const only = process.env["TOKENS_ONLY"];
  return (only === undefined ? out : out.filter((r) => only.split(",").includes(r.label)))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
}

async function main(): Promise<void> {
  const rows: Row[] = [];
  for (const repo of corpus()) {
    process.stderr.write(`  ${repo.label}…\n`);
    const root = await fetchGoldenRepo(repo);
    if (root === null) continue;
    const dir = repo.auditSubpath === "." ? root : join(root, repo.auditSubpath);
    const audited = auditTokens(dir);
    rows.push({
      repo: repo.label,
      seen: audited?.nodes ?? -1,
      sources: audited?.sources ?? 0,
      declaredSass: await countIn(dir, [".scss", ".sass", ".less"], SASS_DECL),
      declaredCssVar: await countIn(dir, [".css", ".scss", ".sass"], CSS_VAR_DECL),
      declaredJs: await countIn(dir, [".js", ".ts", ".mjs", ".cjs"], JS_TOKEN_ENTRY),
    });
  }

  if (AS_JSON) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  process.stdout.write(
    `${pad("repo", 22)}${pad("seen", 8)}${pad("srcs", 6)}${pad("sass $", 9)}${pad("--css", 9)}js-ish\n`,
  );
  for (const r of rows) {
    process.stdout.write(
      pad(r.repo, 22) + pad(r.seen < 0 ? "(failed)" : String(r.seen), 8) + pad(String(r.sources), 6) +
        pad(String(r.declaredSass), 9) + pad(String(r.declaredCssVar), 9) +
        String(r.declaredJs) + "\n",
    );
  }

  const invisible = rows.filter(
    (r) => r.seen === 0 || r.seen * 10 < r.declaredSass + r.declaredCssVar + r.declaredJs,
  );
  process.stdout.write(
    `\n${rows.length} repositories · ${invisible.length} where Lyse sees fewer than a tenth of the ` +
      `declaration-shaped lines present\n`,
  );

  const wouldGainSass = rows.filter((r) => r.declaredSass > r.seen).length;
  const wouldGainJs = rows.filter((r) => r.declaredJs > r.seen).length;
  process.stdout.write(
    `\nA Sass reader would have more to read than the current loader found on ${wouldGainSass} of ${rows.length}.\n` +
      `A JS/TS token-module reader, on ${wouldGainJs} of ${rows.length}.\n` +
      `\nCaveat that matters: the declaration columns count LINES, and a repo shipping N\n` +
      `themes declares the same token name N times. daisyui (35 themes) and mantine\n` +
      `declare 1918 and 1611 css-var lines for far fewer distinct names, so their gap is\n` +
      `mostly dedup, not blindness. The unambiguous cases are single-theme repos and JS:\n` +
      `chakra sees 0 of 995 JS-ish declarations, bootstrap 113 of 1299 Sass, element-plus\n` +
      `15 of 461. Read the ratio as a pointer, never as a score.\n`,
  );

  if (rows.length === 0) {
    process.stdout.write("\nFAIL: nothing was measured.\n");
    process.exitCode = 1;
  }
}

await main();
