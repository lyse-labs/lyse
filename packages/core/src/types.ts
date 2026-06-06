export type Severity = "error" | "warning" | "info";

export type AxisName = "tokens" | "a11y" | "components" | "stories" | "ai-surface" | "ai-governance";

export type BuiltInRuleId =
  | "tokens/no-hardcoded-color"
  | "tokens/no-hardcoded-spacing"
  | "tokens/no-hardcoded-typography"
  | "tokens/no-hardcoded-radii"
  | "tokens/no-hardcoded-shadow"
  | "tokens/no-hardcoded-motion-duration"
  | "tokens/no-hardcoded-motion-easing"
  | "tokens/no-hardcoded-breakpoints"
  | "tokens/no-hardcoded-z-index"
  | "tokens/no-hardcoded-opacity"
  | "tokens/no-hardcoded-border-width"
  | "tokens/dtcg-conformance"
  | "tokens/description-coverage"
  | "components/no-native-shadows"
  | "components/contracts-strictness"
  | "naming/component-pascalcase"
  | "naming/hook-prefix"
  | "naming/prop-camelcase"
  | "a11y/essentials"
  | "stories/coverage"
  | "stories/variant-coverage"
  | "ai-surface/agents-md-quality"
  | "ai-surface/component-manifest-json"
  | "ai-surface/ds-index-exported"
  | "ai-surface/mcp-config-present"
  | "ai-surface/llms-txt-structure"
  | "ai-surface/shadcn-registry-valid"
  | "ai-surface/agent-instruction-files";

export type RuleId = BuiltInRuleId | string;

export interface SourceLocation {
  file: string;     // relative to repo root
  line: number;     // 1-based
  column: number;   // 1-based
}

export interface Finding {
  ruleId: RuleId;
  axis: AxisName;
  severity: Severity;
  location: SourceLocation;
  message: string;
  suggestion?: string;
  context?: string; // ≤ 120 chars of code, no secrets
  confidence?: Confidence;
}

export interface RuleContext {
  repoRoot: string;
  tokens: TokenMap | null;
  componentsModule: string | null;
  componentInventory: ComponentInventoryEntry[];
  storyIndex: StoryIndex | null;
  excludePaths: string[];
  /**
   * True when the repo being audited IS the design system (workspace
   * detection found a DS-export package in the same monorepo). Some rules
   * (no-native-shadows, stories/coverage) skip in this mode because their
   * semantics target consumer-of-DS audits, not DS-self audits. Full
   * DS-self rule semantics planned for v0.2.
   */
  dsSelfMode?: boolean;
}

export interface TokenMap {
  colors: Map<string, string[]>;       // hex → [token-paths]
  spacing: Map<string, string[]>;      // value → [token-paths]
  typography: Map<string, string[]>;   // font-size/weight/line-height/letter-spacing → [token-paths]; keys prefixed "weight/", "line-height/", "letter-spacing/", "family/" for sub-types
  radii: Map<string, string[]>;        // border-radius value → [token-paths]
  shadows: Map<string, string[]>;      // box-shadow value → [token-paths]
  motion: Map<string, string[]>;       // duration + easing; keys prefixed "duration/" or "easing/"
  breakpoints: Map<string, string[]>;  // media-query widths → [token-paths]
  zIndex: Map<string, string[]>;       // z-index values → [token-paths]
  opacity: Map<string, string[]>;      // opacity values → [token-paths]
  borderWidth: Map<string, string[]>;  // border-width values → [token-paths]
  source: "tailwind-v3" | "tailwind-v4" | "dtcg" | "css-vars" | "mixed";
}

/** A single prop extracted from a component's TypeScript type annotation. */
export interface ComponentPropEntry {
  /** Prop identifier, e.g. "variant" */
  name: string;
  /**
   * Raw TypeScript type text, e.g. '"primary" | "secondary" | "ghost"'.
   * For props imported from another file, this will be the reference name
   * (e.g. "ButtonProps") without cross-file resolution (v0.2 enhancement).
   */
  typeText?: string;
  /** True when the prop is optional (`?:`). */
  isOptional?: boolean;
  /** Default value extracted from destructuring, e.g. "primary" for `{ variant = "primary" }`. */
  defaultValue?: string;
  /**
   * True when `typeText` is a string-literal union (all members are string literals),
   * e.g. `'"primary" | "secondary"`.
   */
  isVariantUnion?: boolean;
  /** Extracted string-literal values when `isVariantUnion` is true. */
  variants?: string[];
}

export interface ComponentInventoryEntry {
  name: string;          // "Button"
  module: string;        // "@acme/ui"
  usageCount: number;    // files importing this component
  /**
   * Props extracted from the component's TypeScript prop type definition.
   * Populated by buildComponentInventory when the loader can parse the source files.
   * Absent when the component source is not available for analysis.
   */
  props?: ComponentPropEntry[];
}

/**
 * A single named export from a CSF v3 story file.
 * Extracted from `export const Primary = { args: { variant: "primary" } }`.
 */
export interface StoryExport {
  /** Export name, e.g. "Primary" */
  name: string;
  /**
   * Simple literal args extracted from the story's `args` object.
   * Only string/number/boolean literals are extracted; complex expressions are skipped.
   * Example: { variant: "primary", size: "md", disabled: false }
   */
  args?: Record<string, string | number | boolean>;
}

/**
 * Per-file story entry with CSF v3 export data.
 * Extends the original minimal `{ id, importPath }` shape with parsed story exports.
 */
export interface StoryEntry {
  id: string;
  importPath: string;
  /**
   * Component name from the default export's `component` field (best-effort).
   * e.g. `export default { component: Button }` → componentName = "Button"
   * Absent when the default export is complex or uses a variable reference
   * not visible as a direct identifier.
   */
  componentName?: string;
  /**
   * Named story exports from the file.
   * e.g. `export const Primary = { args: { variant: "primary" } }` →
   * stories = [{ name: "Primary", args: { variant: "primary" } }]
   * Absent when no exports were extracted (complex factory patterns, parse errors).
   */
  stories?: StoryExport[];
}

export interface StoryIndex {
  byTitle: Map<string, StoryEntry>;
}

export interface Rule {
  id: RuleId;
  axis: AxisName;
  evaluate(ctx: RuleContext, parsedFiles: ParsedFiles): Promise<RuleEvalResult>;
  classifyConfidence?: (finding: Finding, ctx: ClassifyContext) => Confidence;
  applyCodemod?: (finding: Finding, ctx: CodemodContext) => CodemodResult;
}

export interface ParsedFiles {
  ts: ParsedTsFile[];
  css: ParsedCssFile[];
  cssInJs: ExtractedCssInJsBlock[];
}

export interface ParsedTsFile {
  path: string;
  ast: unknown;      // SWC AST; opaque outside parsers
  source: string;    // original text, needed for line/column resolution
  imports: ImportRecord[];
}

export interface ImportRecord {
  module: string;
  named: string[];
  default: string | null;
  line: number;
}

export interface ParsedCssFile {
  path: string;
  source: string;
  /**
   * Set to `true` for `.sass` (indented syntax) files which are still skipped
   * in v0.1. `.scss` is fully parsed via `parsers/scss-transform.ts` and the
   * transformed CSS-equivalent source is returned in `source`.
   * Also set to `true` if the SCSS transform throws unexpectedly so the
   * pipeline degrades gracefully instead of crashing the audit.
   */
  skipped?: true;
}

export interface ExtractedCssInJsBlock {
  path: string;
  line: number;
  content: string;   // the template literal content with interpolation placeholders
}

export interface ParseError {
  file: string;
  reason: string;
}

export interface RuleEvalResult {
  findings: Finding[];
  opportunities: number; // for scorer; nodes/files that *could* have triggered the rule
  /**
   * Files the rule attempted to analyze but had to skip because its parser
   * could not understand them. Surfaced as `meta.parseErrors` in the audit
   * output so users can see what was NOT analyzed (transparency over silent
   * 100/100 scores). v0.1 limitation — see issue #155.
   */
  parseErrors?: ParseError[];
}

export interface AxisScore {
  axis: AxisName;
  score: number | "N/A";
  findings: number;
  opportunities: number;
}

export interface Layer4Meta {
  /** True when the LLM response was served from cache. */
  cacheHit?: boolean;
  /** USD spent on LLM calls (0 on cache hit). */
  usdSpent?: number;
  /** Model identifier as reported by the connector. */
  modelUsed?: string;
  /** "higher" for frontier models, "lower" for local/free-tier. */
  llmQuality?: "higher" | "lower";
  /** Number of LLM-proposed findings dropped by the validator. */
  droppedHallucinations?: number;
  /** Set to true when Layer 4 was intentionally skipped via --static-only. */
  staticOnly?: boolean;
  /** Non-fatal error that occurred during Layer 4 (audit continues with Layers 1+2 score). */
  error?: { kind: string; message: string };
}

export interface CoverageMeta {
  /** Count of source files actually walked by the scanner (NOT a generic find of the repo). */
  scannedFiles: number;
  /** Audit pipeline duration in milliseconds (excludes Node boot and CLI argument parsing). */
  durationMs: number;
  /** Resolved path to the user's .lyse.yaml, or `null` when no config file was discovered. */
  configPath: string | null;
  /**
   * Files a rule attempted to analyze but could not parse. Deterministic (same
   * file → same reason), sorted by `file` ascending. Omitted when no rule reported
   * a parse failure. Tracks #155.
   */
  parseErrors?: ParseError[];
}

export interface AuditResult {
  schemaVersion: 2;
  rulesVersion: string;
  toolVersion: string;
  /**
   * The pinned scoring-formula version stamped on every emitted audit artifact.
   * Currently always `"scoring-v1"`. Bumping to `"scoring-v2"` is a semver-major
   * event — same input may produce a different score.
   * (ADR 0017 + spec §3 falsifiable claim 1.)
   */
  scoringVersion: "scoring-v1";
  repoRoot: string;
  timestamp: string;        // ISO date (day-truncated for bench; full ISO for local)
  stack: string[];          // ["react", "tailwind", "storybook", ...]
  finalScore: number | "N/A";
  tier: string;
  axes: AxisScore[];
  findings: Finding[];      // all findings, ordered by severity desc
  /** ADR-0015: Layer 4 LLM augmentation metadata + #156 audit-perimeter signals. */
  meta?: {
    layer4?: Layer4Meta;
    /** Phase 1 of #156 — audit-perimeter signals so the score has a visible denominator. Includes `parseErrors` (#155) as a deterministic subfield. */
    coverage?: CoverageMeta;
  };
}

export interface RuleMeta {
  id: RuleId;
  axis: AxisName;
  defaultSeverity: Severity;
  shortDescription: string;       // 1-line, SARIF-compatible
  fullDescription: string;        // markdown, multi-line
  helpUri: string;                // URL pointing at rules docs
  rationale: string;              // markdown
  examples: { good: string; bad: string }[];
  allowlist: string[];            // patterns or values explicitly excluded
}

export interface RulesManifest {
  schemaVersion: "1.0.0";
  rulesVersion: string;
  rules: RuleMeta[];
}

export type Confidence = "high" | "medium" | "low";

export function isValidConfidence(v: unknown): v is Confidence {
  return v === "high" || v === "medium" || v === "low";
}

export interface LyseConfig {
  designSystem?: {
    componentsModule?: string;
    elements?: Record<string, string>;
    excludePaths?: string[];
  };
  llm?: {
    provider?: 'anthropic' | 'openai' | 'openai-compatible' | 'mcp' | 'none' | 'auto';
    model?: string;
    endpoint?: string;
    /** ADR-0015: ConnectorResolver fields (Task 2) */
    connector?: 'auto' | 'mcp-host' | 'openrouter' | 'direct-api-key' | 'ollama';
    costCapUsd?: number;
    cacheMaxAgeDays?: number;
    staticOnly?: boolean;
  };
}

export interface ClassifyContext {
  tokens: TokenMap;
  components: Set<string>;
  config: LyseConfig;
  /**
   * Absolute path to the repository root being audited. Optional because
   * historical callers built `ClassifyContext` without this field; rules
   * that need on-demand semantic resolution (e.g. via ts-morph) should
   * degrade gracefully when it is absent.
   */
  repoRoot?: string;
}

export interface CodemodContext extends ClassifyContext {
  fileContent: string;
  parsedAst: unknown;
}

export interface CodemodResult {
  diff: string;
  importsAdded: string[];
  confidence: Confidence;
  warnings?: string[];
}
