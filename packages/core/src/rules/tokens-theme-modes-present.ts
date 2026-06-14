import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "tokens/theme-modes-present";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// CSS/SCSS signal patterns
const RE_PREFERS_COLOR_SCHEME = /@media\s*\(\s*prefers-color-scheme\s*:/i;
const RE_DATA_THEME = /\[data-(?:theme|mode|color-mode)/i;
// Matches a `.dark` / `.light` class selector, including compound element
// selectors (`body.dark`, `html.light`, `:root.dark`). The trailing `\b`
// keeps `.darker` / `.lightbox` from counting; CSS values never contain a
// literal `.dark`/`.light` token, so a leading guard is unnecessary.
const RE_CLASS_MODE = /\.(?:dark|light)\b/m;
const RE_TAILWIND_VARIANT = /@variant\s+dark\b|(?:^|\s)dark:/m;

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

function hasModeInCssSources(cssFiles: { path: string; source: string; skipped?: true }[]): boolean {
  for (const f of cssFiles) {
    if (f.skipped) continue;
    const src = f.source;
    if (
      RE_PREFERS_COLOR_SCHEME.test(src) ||
      RE_DATA_THEME.test(src) ||
      RE_CLASS_MODE.test(src) ||
      RE_TAILWIND_VARIANT.test(src)
    ) {
      return true;
    }
  }
  return false;
}

function hasModeInTokenFiles(repoRoot: string): boolean {
  let entries: string[] = [];
  try {
    entries = fg.sync(
      ["**/*.tokens.json", "tokens/**/*.json", "**/tokens/**/*.json", "**/*.tokens.js", "**/*.tokens.ts"],
      {
        cwd: repoRoot,
        absolute: false,
        dot: false,
        ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
        followSymbolicLinks: false,
      },
    );
  } catch {
    return false;
  }

  for (const rel of entries) {
    const content = readFileIfSmall(join(repoRoot, rel));
    if (content === null) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Not parseable JSON — fall back to text heuristic
      if (/"dark"\s*:|"light"\s*:/.test(content)) return true;
      continue;
    }

    if (hasDtcgModeGroup(parsed)) return true;
  }
  return false;
}

function hasDtcgModeGroup(node: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof node !== "object" || node === null) return false;

  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const k = key.toLowerCase();
    if (k === "dark" || k === "light") return true;
    // DTCG $extensions.mode or W3C mode split
    if (k === "$extensions") {
      const ext = obj[key];
      if (typeof ext === "object" && ext !== null) {
        const extKeys = Object.keys(ext as Record<string, unknown>).map((x) => x.toLowerCase());
        if (extKeys.includes("mode") || extKeys.includes("modes")) return true;
      }
    }
    if (hasDtcgModeGroup(obj[key], depth + 1)) return true;
  }
  return false;
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }

  if (isAllowlisted(ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

  const found =
    hasModeInCssSources(files.css) ||
    hasModeInTokenFiles(ctx.repoRoot);

  if (found) {
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "tokens",
    severity: "warning",
    location: { file: "tokens/", line: 1, column: 1 },
    message:
      "No theme-mode signal found — design system does not appear to define light/dark modes",
    suggestion:
      "add a `prefers-color-scheme` media query, a `[data-theme]` selector, a `.dark`/`.light` class convention, or a DTCG token group named `dark`/`light`",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Design system should define light/dark theme modes",
    fullDescription:
      "Checks whether the repository defines theme modes (light/dark) via any of: a `prefers-color-scheme` media query in CSS/SCSS; a `[data-theme]`, `[data-mode]`, or `[data-color-mode]` attribute selector; a `.dark`/`.light` class convention; a DTCG/token JSON file with a `dark` or `light` group or `$extensions` mode split; or a Tailwind v4 `@variant dark` / `dark:` usage indicator. Emits one warning at repo level when no signal is found. Emits nothing when any signal is present.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-theme-modes-present.md",
    rationale: `Why it matters

Design systems without explicit theme-mode declarations leave consumers to implement their own ad-hoc dark-mode strategies, leading to inconsistent behaviour across products. A repo-level signal — however simple — proves the design system has taken a position on color-scheme support.

The check is intentionally broad: any of the five detection signals (media query, data attribute, class convention, DTCG group, Tailwind v4 variant) counts as "present". The rule is experimental and does not contribute to the health score until calibration data is available.`,
    examples: [
      {
        good: ":root { --color-bg: #fff; } [data-theme=\"dark\"] { --color-bg: #111; }",
        bad: ":root { --color-bg: #fff; }",
      },
      {
        good: "@media (prefers-color-scheme: dark) { :root { --color-bg: #111; } }",
        bad: "/* no color-scheme awareness */",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/theme-modes-present` in a README — rule is N/A",
      "token files larger than 1 MB — skipped to avoid pathological cases",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  isAllowlisted,
  hasModeInCssSources,
  hasModeInTokenFiles,
  hasDtcgModeGroup,
  DISABLE_DIRECTIVE,
};
