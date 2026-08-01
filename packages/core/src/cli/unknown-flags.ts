import { ScopeError } from "../commands/audit-flags.js";

const CITTY_INTERNAL = new Set(["_", "--"]);

function camel(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Flags the user passed that the command never declared. citty accepts them
 * silently, so `--treshold=99` runs a full audit and exits 0 where
 * `--threshold=99` would have failed the build — a one-character typo in a
 * workflow file turns a red gate green with no signal at all.
 */
export function unknownFlags(
  args: Record<string, unknown>,
  declared: Record<string, unknown>,
): string[] {
  const allowed = new Set<string>();
  for (const key of Object.keys(declared)) {
    allowed.add(key);
    allowed.add(camel(key));
    // citty normalises `--no-x` to `x: false`, so a declared `no-color` arrives
    // as `color` and a declared `color` passed as `--no-color` arrives as
    // `color` too. Accept both directions or valid invocations are rejected.
    allowed.add(`no-${key}`);
    allowed.add(camel(`no-${key}`));
    if (key.startsWith("no-")) {
      const positive = key.slice(3);
      allowed.add(positive);
      allowed.add(camel(positive));
    }
  }
  const out = new Set<string>();
  for (const key of Object.keys(args)) {
    if (CITTY_INTERNAL.has(key) || allowed.has(key)) continue;
    out.add(key);
  }
  return [...out].sort();
}

/** Fail closed on an undeclared flag. ScopeError maps to exit 64 (EX_USAGE). */
export function assertKnownFlags(
  args: Record<string, unknown>,
  declared: Record<string, unknown>,
  command: string,
): void {
  const unknown = unknownFlags(args, declared);
  if (unknown.length === 0) return;
  const list = unknown.map((f) => `--${f}`).join(", ");
  throw new ScopeError(
    `unknown option ${list} for \`lyse ${command}\`. Run \`lyse ${command} --help\` for the supported flags.`,
  );
}
