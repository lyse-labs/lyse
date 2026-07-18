import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "lightningcss";
import { normalizeToDtcg } from "../tokens/normalizer.js";
import type { DtcgDocument, DtcgGroup } from "../tokens/dtcg-model.js";
import { isDtcgToken, isDtcgGroup } from "../tokens/dtcg-model.js";
import type { StackDetection } from "./init-detect.js";
import type { ComponentInventoryEntry } from "../types.js";

const NATIVE_TO_DS: Array<[string, string]> = [
  ["button", "Button"],
  ["input", "Input"],
  ["select", "Select"],
  ["textarea", "Textarea"],
  ["a", "Link"],
];

export interface LyseMdInputs {
  repoRoot: string;
  stack: StackDetection;
  componentsModule: string | null;
  componentInventory: ComponentInventoryEntry[];
}

interface TokenSummary {
  source: string | null;
  groups: { name: string; count: number; paths: string[] }[];
  totalTokens: number;
}

export function writeLyseMd(inputs: LyseMdInputs): { path: string; created: boolean; updated: boolean } {
  const path = join(inputs.repoRoot, "LYSE.md");
  const content = buildLyseMd(inputs);
  const exists = existsSync(path);
  const prev = exists ? readFileSync(path, "utf8") : null;
  if (prev === content) return { path, created: false, updated: false };
  writeFileSync(path, content);
  return { path, created: !exists, updated: exists };
}

function buildLyseMd(inputs: LyseMdInputs): string {
  const tokens = buildTokenSummary(inputs.repoRoot, inputs.stack.styling);
  const lines: string[] = [];
  lines.push("# LYSE.md");
  lines.push("");
  lines.push("Machine-readable summary of this repository's design-system surface.");
  lines.push("Regenerate via `lyse init`. Sections below are deterministic.");
  lines.push("");

  lines.push("## Detected stack");
  lines.push("");
  lines.push(`- framework: ${inputs.stack.framework}`);
  lines.push(`- styling: ${inputs.stack.styling}`);
  lines.push(`- typescript: ${inputs.stack.hasTypeScript}`);
  lines.push(`- test-runners: ${inputs.stack.testRunners.slice().sort().join(", ")}`);
  lines.push("");

  lines.push("## Design tokens (DTCG)");
  lines.push("");
  if (tokens.source) {
    lines.push(`- source: ${tokens.source}`);
    lines.push(`- total tokens: ${tokens.totalTokens}`);
    lines.push("");
    if (tokens.groups.length === 0) {
      lines.push("_No tokens found in source._");
      lines.push("");
    } else {
      for (const g of tokens.groups) {
        lines.push(`### ${g.name} (${g.count})`);
        lines.push("");
        for (const p of g.paths) {
          lines.push(`- ${p}`);
        }
        lines.push("");
      }
    }
  } else {
    lines.push("_No token source detected. Add a `tailwind.config.{js,ts}`, a `@theme` block in CSS, or `tokens.json` (DTCG) at the repo root._");
    lines.push("");
  }

  lines.push("## Component manifest");
  lines.push("");
  if (inputs.componentsModule) {
    lines.push(`- components module: \`${inputs.componentsModule}\``);
    if (inputs.componentInventory.length === 0) {
      lines.push("- inventory: (none detected — run `lyse audit` to populate)");
    } else {
      lines.push(`- inventory (${inputs.componentInventory.length}):`);
      const sorted = inputs.componentInventory.slice().sort((a, b) => a.name.localeCompare(b.name));
      for (const c of sorted) {
        lines.push(`  - \`${c.name}\` from \`${c.module}\``);
      }
    }
  } else {
    lines.push("_No `componentsModule` configured in `.lyse.yaml`. Set `designSystem.componentsModule: '@your-org/ui'` to enable the component manifest._");
  }
  lines.push("");

  lines.push("## Approved imports");
  lines.push("");
  if (inputs.componentsModule) {
    lines.push(`Use components from \`${inputs.componentsModule}\` instead of native HTML elements wherever a DS equivalent exists.`);
  } else {
    lines.push("_No approved imports configured. Set `designSystem.componentsModule` in `.lyse.yaml`._");
  }
  lines.push("");

  lines.push("## Deny-list (native HTML elements with DS equivalents)");
  lines.push("");
  for (const [native, ds] of NATIVE_TO_DS) {
    lines.push(`- \`<${native}>\` → use \`<${ds}>\``);
  }
  lines.push("");

  return lines.join("\n");
}

function buildTokenSummary(repoRoot: string, styling: StackDetection["styling"]): TokenSummary {
  const doc = loadDtcgDocument(repoRoot, styling);
  if (!doc.document) return { source: null, groups: [], totalTokens: 0 };
  const groups = collectGroups(doc.document);
  const totalTokens = groups.reduce((s, g) => s + g.count, 0);
  return { source: doc.source, groups, totalTokens };
}

function loadDtcgDocument(repoRoot: string, styling: StackDetection["styling"]): { source: string | null; document: DtcgDocument | null } {
  const dtcgPath = findDtcgFile(repoRoot);
  if (dtcgPath) {
    try {
      const raw = JSON.parse(readFileSync(dtcgPath, "utf8")) as unknown;
      const norm = normalizeToDtcg({ source: "dtcg", data: raw });
      return { source: `dtcg (${relative(repoRoot, dtcgPath)})`, document: norm.document };
    } catch {
      // fall through
    }
  }

  if (styling === "tailwind-v4") {
    const decls = extractTailwindV4Decls(repoRoot);
    if (decls.length > 0) {
      const norm = normalizeToDtcg({ source: "tailwind-v4", data: decls });
      return { source: "tailwind-v4", document: norm.document };
    }
  }

  if (styling === "tailwind-v3") {
    const cfg = loadTailwindV3Config(repoRoot);
    if (cfg) {
      const norm = normalizeToDtcg({ source: "tailwind-v3", data: cfg });
      return { source: "tailwind-v3", document: norm.document };
    }
  }

  return { source: null, document: null };
}

function findDtcgFile(repoRoot: string): string | null {
  const candidates = ["tokens.json", "design-tokens.json", "tokens/index.json"];
  for (const c of candidates) {
    const p = join(repoRoot, c);
    if (existsSync(p)) return p;
  }
  return null;
}

function loadTailwindV3Config(repoRoot: string): Record<string, unknown> | null {
  const candidates = ["tailwind.config.js", "tailwind.config.cjs", "tailwind.config.mjs", "tailwind.config.ts"];
  const found = candidates.find((c) => existsSync(join(repoRoot, c)));
  if (!found) return null;
  try {
    const src = readFileSync(join(repoRoot, found), "utf8");
    const m = src.match(/module\.exports\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (!m || !m[1]) return null;
    const jsonish = m[1].replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
    return JSON.parse(jsonish) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractTailwindV4Decls(repoRoot: string): Array<[string, string]> {
  const candidates = [
    "app.css",
    "globals.css",
    "src/app.css",
    "src/globals.css",
    "src/styles/globals.css",
    "styles/globals.css",
    "app/globals.css",
  ];
  for (const c of candidates) {
    const path = join(repoRoot, c);
    if (!existsSync(path)) continue;
    try {
      const css = readFileSync(path, "utf8");
      if (!/@theme\b/.test(css)) continue;
      try {
        transform({ filename: path, code: Buffer.from(css), errorRecovery: true });
      } catch {
        continue;
      }
      return parseThemeDecls(css);
    } catch {
      // ignore
    }
  }
  return [];
}

function parseThemeDecls(css: string): Array<[string, string]> {
  const decls: Array<[string, string]> = [];
  const themeRegex = /@theme\b[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = themeRegex.exec(css)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth !== 0) continue;
    const body = css.slice(start, i - 1).replace(/\/\*[\s\S]*?\*\//g, "");
    const declRegex = /(--[^\s:{}]+)\s*:\s*([^;]+?)\s*;/g;
    let dm: RegExpExecArray | null;
    while ((dm = declRegex.exec(body)) !== null) {
      const prop = dm[1];
      const value = dm[2];
      if (prop && value !== undefined) decls.push([prop, value.trim()]);
    }
  }
  return decls;
}

function collectGroups(doc: DtcgDocument): { name: string; count: number; paths: string[] }[] {
  const out: { name: string; count: number; paths: string[] }[] = [];
  const keys = Object.keys(doc).filter((k) => !k.startsWith("$")).sort();
  for (const key of keys) {
    const entry = doc[key];
    if (!isDtcgGroup(entry)) continue;
    const paths = collectTokenPaths(entry, [key]).sort();
    out.push({ name: key, count: paths.length, paths });
  }
  return out;
}

function collectTokenPaths(node: DtcgGroup, path: string[]): string[] {
  const out: string[] = [];
  for (const k of Object.keys(node).filter((kk) => !kk.startsWith("$")).sort()) {
    const v = node[k];
    if (isDtcgToken(v)) {
      out.push([...path, k].join("."));
    } else if (isDtcgGroup(v)) {
      out.push(...collectTokenPaths(v, [...path, k]));
    }
  }
  return out;
}

function relative(root: string, p: string): string {
  if (p.startsWith(root + "/")) return p.slice(root.length + 1);
  return p;
}
