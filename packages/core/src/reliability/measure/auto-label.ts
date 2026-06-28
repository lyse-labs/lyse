import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { measureKindOf } from "./rule-measure-kind.js";
import type { FindingRow } from "../../../../scripts/harvest-findings.js";

export type Label = { verdict: "tp" | "fp"; source: "auto"; reason: string };

// Verifier: given repoDir, returns true if the artifact is genuinely ABSENT
// (i.e., the structural finding is a true positive).
type Verifier = (repoDir: string) => boolean;

// ── helpers ──────────────────────────────────────────────────────────────────

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const VERSION_HEADING_RE = /^#{1,3}\s*\[?v?\d+\.\d+(\.\d+)?/m;

const CHANGELOG_CANDIDATES = [
  "CHANGELOG.md",
  "CHANGELOG",
  "CHANGELOG.mdx",
  "changelog.md",
  "HISTORY.md",
  "CHANGES.md",
  "docs/CHANGELOG.md",
];

const MCP_CONFIG_CANDIDATES = [".mcp.json", ".cursor/mcp.json", "claude_desktop_config.json"];

const AGENTS_CANDIDATES = ["AGENTS.md", ".github/AGENTS.md", "docs/AGENTS.md"];

const GUIDE_FILE_RE = /^(migrat|migrating|upgrad|upgrading|upgrade)[\w.-]*\.mdx?$/i;
const GUIDE_STEM_RE = /^(migration|migrating|upgrade|upgrading|migrate)$/i;
const GUIDE_HEADING_RE = /^#{1,4}\s+.*\b(migrat(e|ion|ing)|upgrad(e|ing))\b/im;
const DOC_DIRS = ["docs", "doc", "documentation", ".github"];

function readSmall(absPath: string, maxBytes = 2_000_000): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function listDir(absPath: string): string[] {
  try {
    return readdirSync(absPath);
  } catch {
    return [];
  }
}

// ── per-rule verifiers (absent = tp) ─────────────────────────────────────────

function manifestAbsent(repoDir: string): boolean {
  const candidates = [
    "components.json",
    "lyse.components.json",
  ];
  // Also check apps/* and packages/* sub-trees (first-level only, cheap).
  for (const base of ["apps", "packages"]) {
    const baseDir = join(repoDir, base);
    for (const sub of listDir(baseDir)) {
      candidates.push(`${base}/${sub}/components.json`);
      candidates.push(`${base}/${sub}/lyse.components.json`);
    }
  }
  for (const rel of candidates) {
    const abs = join(repoDir, rel);
    if (!existsSync(abs)) continue;
    // Confirm it is not a shadcn-config components.json.
    try {
      const raw = readSmall(abs);
      if (raw === null) continue;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) continue;
      const obj = parsed as Record<string, unknown>;
      // shadcn/ui: has $schema pointing to shadcn or has `aliases` without `components`.
      if (typeof obj.$schema === "string" && obj.$schema.includes("shadcn")) continue;
      if (typeof obj.aliases === "object" && obj.aliases !== null && !("components" in obj)) continue;
      // Lyse-style manifest present.
      return false;
    } catch {
      continue;
    }
  }
  return true;
}

function changelogAbsent(repoDir: string): boolean {
  for (const candidate of CHANGELOG_CANDIDATES) {
    const content = readSmall(join(repoDir, candidate));
    if (content !== null && VERSION_HEADING_RE.test(content)) return false;
  }
  return true;
}

function semverAbsent(repoDir: string): boolean {
  const pkgPath = join(repoDir, "package.json");
  const raw = readSmall(pkgPath);
  if (raw === null) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return true;
    const pkg = parsed as { version?: unknown };
    if (typeof pkg.version === "string" && SEMVER_RE.test(pkg.version.trim())) return false;
  } catch {
    return true;
  }
  return true;
}

function isGuideFilename(name: string): boolean {
  if (GUIDE_FILE_RE.test(name)) return true;
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  return GUIDE_STEM_RE.test(stem);
}

function migrationAbsent(repoDir: string): boolean {
  // Root-level migration file.
  if (listDir(repoDir).some(isGuideFilename)) return false;
  // In docs dirs.
  for (const dir of DOC_DIRS) {
    const abs = join(repoDir, dir);
    if (!existsSync(abs)) continue;
    if (listDir(abs).some(isGuideFilename)) return false;
  }
  // Migration section in CHANGELOG or README.
  const docsToScan = [
    "CHANGELOG.md",
    "CHANGELOG",
    "HISTORY.md",
    "CHANGES.md",
    "README.md",
    "README",
    "README.mdx",
  ];
  for (const candidate of docsToScan) {
    const content = readSmall(join(repoDir, candidate));
    if (content !== null && GUIDE_HEADING_RE.test(content)) return false;
  }
  return true;
}

function mcpConfigAbsent(repoDir: string): boolean {
  for (const candidate of MCP_CONFIG_CANDIDATES) {
    if (existsSync(join(repoDir, candidate))) return false;
  }
  return true;
}

function llmsTxtAbsent(repoDir: string): boolean {
  return !existsSync(join(repoDir, "llms.txt"));
}

function agentsMdAbsent(repoDir: string): boolean {
  for (const candidate of AGENTS_CANDIDATES) {
    if (existsSync(join(repoDir, candidate))) return false;
  }
  return true;
}

// ── verifier table ───────────────────────────────────────────────────────────

// Each entry: [verifier, tp-reason, fp-reason, qualityRule?]
// qualityRule=true: file present does NOT prove fp — quality verdict cannot be
// independently verified cheaply, so route to needs-verifier instead.
type VerifierEntry = [Verifier, string, string, true?];

const VERIFIERS: Record<string, VerifierEntry> = {
  "ai-surface/component-manifest-json": [
    manifestAbsent,
    "presence-check: component manifest absent",
    "presence-check: component manifest found (rule fired incorrectly)",
  ],
  "ai-surface/agents-md-quality": [
    agentsMdAbsent,
    "presence-check: AGENTS.md absent",
    "needs-verifier",
    true,
  ],
  "ai-surface/llms-txt-structure": [
    llmsTxtAbsent,
    "presence-check: llms.txt absent",
    "needs-verifier",
    true,
  ],
  "ai-surface/mcp-config-present": [
    mcpConfigAbsent,
    "presence-check: MCP config absent",
    "presence-check: MCP config found (rule fired incorrectly)",
  ],
  "versioning/changelog-present": [
    changelogAbsent,
    "presence-check: structured CHANGELOG absent",
    "presence-check: structured CHANGELOG found (rule fired incorrectly)",
  ],
  "versioning/semver-versioning": [
    semverAbsent,
    "presence-check: no valid semver in package.json",
    "presence-check: valid semver found in package.json (rule fired incorrectly)",
  ],
  "versioning/migration-guide-present": [
    migrationAbsent,
    "presence-check: migration guide absent",
    "presence-check: migration guide found (rule fired incorrectly)",
  ],
};

// ── public API ────────────────────────────────────────────────────────────────

export function autoLabel(row: FindingRow, repoDir: string): Label {
  const kind = measureKindOf(row.ruleId);
  if (kind !== "structural") {
    throw new Error(
      `autoLabel only accepts structural rules; "${row.ruleId}" is "${kind}"`,
    );
  }

  const entry = VERIFIERS[row.ruleId];
  if (entry === undefined) {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }

  const [verifier, tpReason, fpReason, qualityRule] = entry;
  const absent = verifier(repoDir);
  if (absent) return { verdict: "tp", source: "auto", reason: tpReason };
  if (qualityRule) return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  return { verdict: "fp", source: "auto", reason: fpReason };
}
