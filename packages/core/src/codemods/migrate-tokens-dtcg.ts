import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import type { DtcgDocument, DtcgType } from "../tokens/dtcg-model.js";
import { _internal as dtcgConformance } from "../rules/tokens-dtcg-conformance.js";

const { walkDocument, looksLikeDtcg } = dtcgConformance;

/**
 * Style-Dictionary / Tokens-Studio `type` name → DTCG `$type`. Only types we
 * can map to a DTCG primitive are listed; anything else is left raw, which the
 * self-validation gate then rejects (so we never emit an invalid `$type`).
 */
const TYPE_MAP: Record<string, DtcgType> = {
  color: "color",
  spacing: "dimension",
  sizing: "dimension",
  size: "dimension",
  dimension: "dimension",
  borderradius: "dimension",
  radius: "dimension",
  borderwidth: "dimension",
  fontsize: "dimension",
  fontsizes: "dimension",
  letterspacing: "dimension",
  fontfamily: "fontFamily",
  fontfamilies: "fontFamily",
  fontweight: "fontWeight",
  fontweights: "fontWeight",
  lineheight: "number",
  lineheights: "number",
  opacity: "number",
  zindex: "number",
  "z-index": "number",
  number: "number",
  duration: "duration",
  cubicbezier: "cubicBezier",
  easing: "cubicBezier",
};

export type MigrationResult =
  | { ok: true; document: DtcgDocument }
  | { ok: false; reason: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isValueTypeLeaf(node: Record<string, unknown>): boolean {
  return "value" in node && typeof node["type"] === "string";
}

/** Recursively converts `{ value, type }` leaves to `{ $value, $type }`. */
function convert(node: Record<string, unknown>): Record<string, unknown> {
  if (isValueTypeLeaf(node)) {
    const rawType = String(node["type"]).toLowerCase();
    const mapped = TYPE_MAP[rawType];
    const token: Record<string, unknown> = {
      $value: node["value"],
      $type: mapped ?? node["type"],
    };
    if (typeof node["description"] === "string") token["$description"] = node["description"];
    return token;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    // Preserve already-`$`-prefixed metadata (Tokens-Studio $themes/$metadata) verbatim.
    if (k.startsWith("$")) out[k] = v;
    else if (isPlainObject(v)) out[k] = convert(v);
    else out[k] = v;
  }
  return out;
}

/** True when the tree contains at least one `{ value, type }` leaf. */
function hasValueTypeLeaf(node: unknown, budget = 64): boolean {
  if (budget < 0 || !isPlainObject(node)) return false;
  if (isValueTypeLeaf(node)) return true;
  for (const v of Object.values(node)) {
    if (isPlainObject(v) && hasValueTypeLeaf(v, budget - 1)) return true;
  }
  return false;
}

/** First leaf `type` that has no DTCG mapping, or null when all map. */
function firstUnmappableType(node: unknown, budget = 64): string | null {
  if (budget < 0 || !isPlainObject(node)) return null;
  if (isValueTypeLeaf(node)) {
    const t = String(node["type"]).toLowerCase();
    return t in TYPE_MAP ? null : String(node["type"]);
  }
  for (const v of Object.values(node)) {
    const found = firstUnmappableType(v, budget - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Migrates one parsed token JSON document from Style-Dictionary / Tokens-Studio
 * `{ value, type }` form to DTCG `{ $value, $type }`.
 *
 * Safe by construction: the transformed document is validated with Lyse's own
 * `dtcg-conformance` walker, and the migration is refused (`ok: false`) if it
 * would produce ANY conformance issue — the codemod never writes invalid DTCG
 * or guesses missing information (e.g. a unit for a bare number).
 */
export function migrateTokenJsonToDtcg(json: unknown): MigrationResult {
  if (!isPlainObject(json)) return { ok: false, reason: "not a JSON object" };
  if (looksLikeDtcg(json)) return { ok: false, reason: "already DTCG ($value present)" };
  if (!hasValueTypeLeaf(json)) {
    return { ok: false, reason: "no { value, type } token leaves found" };
  }
  const unmappable = firstUnmappableType(json);
  if (unmappable) {
    return { ok: false, reason: `unmappable token type "${unmappable}" (no DTCG $type)` };
  }

  const document = convert(json) as DtcgDocument;
  const { tokenCount, issues } = walkDocument(document);
  if (tokenCount === 0) return { ok: false, reason: "no tokens after conversion" };
  if (issues.length > 0) {
    return { ok: false, reason: `would produce non-conformant DTCG: ${issues[0]!.message}` };
  }
  return { ok: true, document };
}

const MAX_TOKEN_FILE_BYTES = 1_000_000;
const TOKEN_GLOBS = ["**/tokens.json", "**/tokens/**/*.json", "**/*.tokens.json"];

export interface TokenMigration {
  /** Repo-relative path of the token file. */
  path: string;
  /** DTCG JSON content to write (2-space indent + trailing newline). */
  content: string;
}

export interface TokenMigrationPlan {
  migrations: TokenMigration[];
  /** Files that were considered but left untouched, with the reason. */
  skipped: { path: string; reason: string }[];
}

/**
 * Discovers legacy (`{ value, type }`) token JSON under `repoRoot` and computes
 * the DTCG-migrated content for each. Pure planning — performs NO writes; the
 * caller (`lyse init --migrate-tokens`) applies the plan behind the safety
 * guards. Results are sorted by path for determinism. Already-DTCG and
 * non-conformant-after-conversion files are reported under `skipped`.
 */
export function migrateLegacyTokensToDtcg(repoRoot: string): TokenMigrationPlan {
  const migrations: TokenMigration[] = [];
  const skipped: { path: string; reason: string }[] = [];

  let rels: string[];
  try {
    rels = fg.sync(TOKEN_GLOBS, {
      cwd: repoRoot,
      absolute: false,
      onlyFiles: true,
      unique: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
    });
  } catch {
    return { migrations, skipped };
  }

  for (const rel of rels.sort()) {
    const abs = join(repoRoot, rel);
    let raw: string;
    try {
      if (statSync(abs).size > MAX_TOKEN_FILE_BYTES) continue;
      raw = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const result = migrateTokenJsonToDtcg(parsed);
    if (result.ok) {
      migrations.push({ path: rel, content: `${JSON.stringify(result.document, null, 2)}\n` });
    } else {
      skipped.push({ path: rel, reason: result.reason });
    }
  }

  return { migrations, skipped };
}
