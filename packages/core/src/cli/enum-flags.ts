import { ScopeError } from "../commands/audit-flags.js";

export interface EnumFlagSpec {
  readonly flag: string;
  readonly values: readonly string[];
}

export interface BadEnumValue {
  readonly flag: string;
  readonly value: string;
  readonly values: readonly string[];
  readonly suggestion?: string;
}

/**
 * The accepted values for `lyse audit`'s two enum-valued flags. Kept beside the
 * validator rather than inline in cli.ts so the list has exactly one home: the
 * `--format` dispatch is an if/else-if chain and the `--scope` handling is two
 * separate `=== "new"` comparisons, so neither one can be read off a single
 * declaration.
 */
export const AUDIT_ENUM_FLAGS: readonly EnumFlagSpec[] = [
  { flag: "scope", values: ["changed", "staged", "uncommitted", "new"] },
  { flag: "format", values: ["json", "text", "table", "tsv", "eslint", "legacy", "sarif", "html"] },
];

/** `lyse explain` renders markdown on `md` and text on everything else. */
export const EXPLAIN_ENUM_FLAGS: readonly EnumFlagSpec[] = [
  { flag: "format", values: ["text", "md"] },
];

/**
 * Values the user passed that the flag does not accept.
 *
 * `assertKnownFlags` fails closed on an unknown flag *name*; this is the same
 * guard one level down, for the value. Without it `--scope New` widened the
 * audit to the whole tree, never reached `evaluateGate`, and exited 0 — a
 * one-character typo in a workflow file turning a red gate green with no
 * signal, which is precisely the failure `unknown-flags.ts` exists to prevent.
 *
 * An empty string is rejected rather than read as "unset": `--scope=` in a
 * workflow is a mistake, and silently auditing the whole tree is the behaviour
 * this module exists to stop.
 */
export function badEnumValues(
  args: Record<string, unknown>,
  specs: readonly EnumFlagSpec[],
): BadEnumValue[] {
  const out: BadEnumValue[] = [];
  for (const spec of specs) {
    if (!(spec.flag in args)) continue;
    const raw = args[spec.flag];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" && spec.values.includes(raw)) continue;
    const value = String(raw);
    const suggestion = spec.values.find((v) => v === value.trim().toLowerCase());
    out.push({
      flag: spec.flag,
      value,
      values: spec.values,
      ...(suggestion !== undefined ? { suggestion } : {}),
    });
  }
  return out;
}

/** Fail closed on an unaccepted value. ScopeError maps to exit 64 (EX_USAGE). */
export function assertEnumValues(
  args: Record<string, unknown>,
  specs: readonly EnumFlagSpec[],
  command: string,
): void {
  const bad = badEnumValues(args, specs);
  if (bad.length === 0) return;
  const lines = bad.map((b) => {
    const hint = b.suggestion ? ` — did you mean \`${b.suggestion}\`?` : ".";
    return `invalid value --${b.flag}=${b.value} for \`lyse ${command}\`${hint} Accepted: ${b.values.join(", ")}.`;
  });
  throw new ScopeError(lines.join("\n[lyse] "));
}
