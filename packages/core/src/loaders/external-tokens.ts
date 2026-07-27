import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import fg from "fast-glob";
import { parseColor } from "../a11y/contrast.js";
import type { TokenNode } from "../graph/types.js";

export interface ExternalTokenPackage {
  name: string;
  files?: string[];
}

// Same custom-property grammar as graph/extract/tokens.ts:104 — kept local so
// this loader stays self-contained (it reads raw package files, not ParsedFiles).
const CSS_DECL_RE = /(--[^\s:{}]+)\s*:\s*([^;]+?)\s*;/g;

// Default artifact discovery when no explicit `files` are configured. CSS is the
// dominant format for the packages v1 targets (Primer/Polaris/Radix); JSON covers
// Style-Dictionary / Adobe (Spectrum). Inner node_modules never searched.
const DEFAULT_PATTERNS = ["**/*.css", "**/tokens.json", "**/*.tokens.json"];

/** Normalize the config union (string | {name, files?}) to the object form. */
export function normalizeTokenPackages(
  raw: ReadonlyArray<string | ExternalTokenPackage> | undefined,
): ExternalTokenPackage[] {
  if (!raw) return [];
  return raw.map((e) => (typeof e === "string" ? { name: e } : e));
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

function colorNodesFromCss(pkgName: string, rel: string, source: string): TokenNode[] {
  const cleaned = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const nodes: TokenNode[] = [];
  let m: RegExpExecArray | null;
  CSS_DECL_RE.lastIndex = 0;
  while ((m = CSS_DECL_RE.exec(cleaned)) !== null) {
    const prop = m[1];
    const rawValue = m[2];
    if (!prop || rawValue === undefined) continue;
    const value = rawValue.trim();
    // Safety filter: only declarations whose value is a real colour become colour
    // tokens — a component-local `--z-modal: 1400` never does.
    if (parseColor(value) === null) continue;
    nodes.push({
      id: `${pkgName}/${rel}#${prop}`,
      axis: "colors",
      rawValue: value.toLowerCase(),
      source: "external-package",
    });
  }
  return nodes;
}

function colorNodesFromJson(pkgName: string, rel: string, source: string): TokenNode[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return [];
  }
  const nodes: TokenNode[] = [];
  const push = (path: string[], value: string): void => {
    nodes.push({
      id: `${pkgName}/${rel}#${path.join(".")}`,
      axis: "colors",
      rawValue: value.toLowerCase().trim(),
      source: "external-package",
    });
  };
  const visit = (node: unknown, path: string[]): void => {
    if (typeof node === "string") {
      if (parseColor(node) !== null) push(path, node);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    // DTCG / value-type leaf: attribute the colour to the leaf path, don't descend.
    const leaf = obj.$value ?? obj.value;
    if (typeof leaf === "string" && parseColor(leaf) !== null) {
      push(path, leaf);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("$")) continue; // strip DTCG/Tokens-Studio $metadata
      visit(v, [...path, k]);
    }
  };
  visit(parsed, []);
  return nodes;
}

/**
 * Reads COLOUR tokens from the shipped artifacts of installed DS packages.
 * Local-first: reads only files already present under `<root>/node_modules`,
 * never the network. Fail-safe: a missing/unreadable package is skipped, never
 * thrown. Deterministic: nodes sorted by id.
 */
export async function fromExternalPackages(
  root: string,
  packages: ExternalTokenPackage[],
): Promise<TokenNode[]> {
  const nodes: TokenNode[] = [];
  for (const pkg of packages) {
    const dir = join(root, "node_modules", pkg.name);
    if (!existsSync(dir)) continue;
    const patterns = pkg.files ?? DEFAULT_PATTERNS;
    let files: string[];
    try {
      files = await fg(patterns, {
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        unique: true,
        ignore: ["**/node_modules/**"],
      });
    } catch {
      continue;
    }
    for (const abs of files.sort()) {
      let source: string;
      try {
        source = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      const rel = toPosix(relative(dir, abs));
      if (abs.endsWith(".css")) nodes.push(...colorNodesFromCss(pkg.name, rel, source));
      else if (abs.endsWith(".json")) nodes.push(...colorNodesFromJson(pkg.name, rel, source));
    }
  }
  nodes.sort((a, b) =>
    a.id !== b.id ? (a.id < b.id ? -1 : 1) : a.rawValue < b.rawValue ? -1 : a.rawValue > b.rawValue ? 1 : 0,
  );
  return nodes;
}
