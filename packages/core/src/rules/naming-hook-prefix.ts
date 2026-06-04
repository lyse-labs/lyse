import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  ClassifyContext,
  Confidence,
  CodemodContext,
  CodemodResult,
} from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { fixNamingHookPrefix } from "../codemods/naming-hook-prefix.js";
import { adaptOldCodemodResult } from "./_codemod-adapter.js";
import { createLyseRule } from "./_rule-module.js";
import {
  bodyCallsHook,
  extractFunctionBody,
  fileIsInHooksDir,
  filenameMatchesFunction,
} from "./_function-body-analysis.js";

// ---------------------------------------------------------------------------
// Hook-prefix patterns
// ---------------------------------------------------------------------------
// A valid custom hook name: starts with "use" + uppercase letter
const VALID_HOOK_NAME_RE = /^use[A-Z][a-zA-Z0-9]*$/;

// ---------------------------------------------------------------------------
// Compliance counter
// ---------------------------------------------------------------------------
// Already correctly named hooks (use + uppercase)
const VALID_HOOK_EXPORT_RE = /\bexport\s+(?:async\s+)?(?:function\s+use[A-Z]|(?:const|let|var)\s+use[A-Z])/g;

/**
 * Counts exported functions that start with `use` + uppercase letter.
 */
export function countCompliantHooks(source: string): number {
  VALID_HOOK_EXPORT_RE.lastIndex = 0;
  const m = source.match(VALID_HOOK_EXPORT_RE);
  return m ? m.length : 0;
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------
// Matches exported functions: export function name(...) / export const name = ...() / export async function name(...)
const EXPORTED_FUNC_RE =
  /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/g;

function locationFromIndex(source: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/**
 * Detect exported functions that look like hooks based on evidence and don't
 * start with the `use` prefix followed by an uppercase letter.
 *
 * Evidence is provided by the shared `_function-body-analysis` helper:
 *   - body-call evidence: function body contains a top-level `use<Upper>(` call
 *   - path-evidence: file lives under `**\/hooks\/**` AND the function name
 *     matches the filename's advertised hook target (e.g. `toggle` in
 *     `use-toggle.ts`). Co-located helpers with unrelated names require
 *     body-call evidence — see issue #166.
 *
 * Without ANY evidence we do not flag — a pure utility named `flattenTree` in
 * a `.tsx` file should remain a utility.
 */
function detectBadlyNamedHooks(
  source: string,
  path: string,
): Array<{ name: string; index: number }> {
  const results: Array<{ name: string; index: number }> = [];
  // Skip test files — test utilities that call hooks internally aren't hooks
  if (/\.(test|spec)\.(tsx?|jsx?)$/.test(path)) return results;

  const hooksDir = fileIsInHooksDir(path);

  EXPORTED_FUNC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPORTED_FUNC_RE.exec(source)) !== null) {
    const name = m[1] ?? m[2];
    if (!name) continue;
    // Already correctly named
    if (VALID_HOOK_NAME_RE.test(name)) continue;
    // Skip PascalCase — those are components, not hooks
    if (/^[A-Z]/.test(name)) continue;

    // Brace-matched body slice — bounded to the function under inspection,
    // so sibling functions further down the file don't bleed in.
    const bodySlice = extractFunctionBody(source, m.index);

    const callEvidence = bodyCallsHook(bodySlice);
    // Path-evidence (issue #166): a function in a `hooks/` directory is
    // flagged via path alone ONLY when its name matches the filename's
    // advertised target (e.g. `toggle` in `use-toggle.ts`). Unrelated
    // co-located helpers (e.g. `composeRefs` in `use-combine-ref.ts`)
    // require body-call evidence.
    const filenameMatch = filenameMatchesFunction(path, name);
    if (!callEvidence && !(hooksDir && filenameMatch)) continue;

    results.push({ name, index: m.index });
  }
  return results;
}

/**
 * Convert a function name to a valid hook name by prepending "use" + capitalize.
 * Examples: getMyData → useMyData, fetchUser → useFetchUser
 */
function toHookName(name: string): string {
  // If it already starts with lowercase, just capitalize first letter and prepend "use"
  const capitalized = name[0] ? name[0].toUpperCase() + name.slice(1) : name;
  return `use${capitalized}`;
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    // Only scan TS/TSX/JS/JSX files
    if (!/\.(tsx?|jsx?)$/.test(f.path)) continue;
    // Skip test/spec files
    if (/\.(test|spec)\.(tsx?|jsx?)$/.test(f.path)) continue;

    opportunities += countCompliantHooks(f.source);

    const hits = detectBadlyNamedHooks(f.source, f.path);
    for (const h of hits) {
      opportunities++;
      const loc = locationFromIndex(f.source, h.index);
      const suggested = toHookName(h.name);
      findings.push({
        ruleId: "naming/hook-prefix",
        axis: "components",
        severity: "warning",
        location: { file: f.path, line: loc.line, column: loc.column },
        message: `Hook '${h.name}' does not start with 'use' + uppercase letter`,
        suggestion: `Rename to '${suggested}' (custom hooks must start with \`use\` + capital letter)`,
      });
    }
  }

  return { findings, opportunities };
};

const classifyConfidence: NonNullable<Rule["classifyConfidence"]> = (
  finding: Finding,
  _ctx: ClassifyContext,
): Confidence => {
  const nameMatch = finding.message.match(/Hook '([\w-]+)'/);
  const name = nameMatch?.[1] ?? "";
  if (!name) return "low";
  // Simple rename (getXxx → useXxx) is high confidence
  // Names with underscores or dashes are more complex → medium
  if (name.includes("_") || name.includes("-")) return "medium";
  return "high";
};

const applyCodemod: NonNullable<Rule["applyCodemod"]> = (
  finding: Finding,
  ctx: CodemodContext,
): CodemodResult => {
  const ruleCtx: RuleContext = {
    repoRoot: "",
    tokens: ctx.tokens,
    componentsModule: ctx.config.designSystem?.componentsModule ?? null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
  const oldResult = fixNamingHookPrefix({
    source: ctx.fileContent,
    path: finding.location.file,
    finding,
    ctx: ruleCtx,
  });
  return adaptOldCodemodResult(oldResult);
};

export const rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: "naming/hook-prefix",
    defaultSeverity: "warning",
    shortDescription: "Custom hooks must start with `use` + uppercase letter",
    fullDescription:
      "Exported functions that call other React hooks internally (useState, useEffect, useMemo, useCallback, useRef, useContext, useReducer, useLayoutEffect, and custom use* hooks) are custom hooks by definition. React's rules-of-hooks linter and runtime depend on the `use` prefix to detect hooks — a function named `getMyData` that calls `useState` internally breaks lint, ESLint plugin react-hooks, and can cause subtle hook order violations.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/naming-hook-prefix.md",
    rationale: `Why it matters

React's rules of hooks use the \`use\` prefix to determine if a function is a hook. A misnamed hook (\`getMyData\` calling \`useState\`) bypasses this detection, so:
1. \`eslint-plugin-react-hooks\` won't apply its rules (silently broken)
2. Calling the function conditionally becomes valid from ESLint's perspective — but will still crash at runtime
3. Other developers don't know the function has hook semantics and may call it in non-hook contexts

Auto-fix renames the declaration to \`use<CapitalizedName>\`. Cross-file callers must be updated separately.`,
    examples: [
      { good: "export function useMyData() { const [d, setD] = useState(null); return d; }", bad: "export function getMyData() { const [d, setD] = useState(null); return d; }" },
      { good: "export const useAuth = () => { const ctx = useContext(AuthCtx); return ctx; };", bad: "export const fetchAuth = () => { const ctx = useContext(AuthCtx); return ctx; };" },
    ],
    allowlist: ["PascalCase components that happen to call hooks (those are components, not hooks)", "test utilities in .test.ts / .spec.ts files", "non-exported functions (internal helpers)"],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  classifyConfidence,
  applyCodemod,
});
