/**
 * Whether a golden run should compare against the committed snapshot, write a
 * new one, or fail.
 *
 * Extracted and tested because the first version got it backwards:
 * `if (UPDATE || !existsSync(snapPath)) writeFileSync(snapPath, json)` — so a
 * deleted snapshot was rewritten from the current output and then asserted
 * against itself. A green run and a run with no reference data were
 * indistinguishable. Same defect `scripts/oracle-verdict.ts` exists to
 * prevent, in a different file.
 *
 * The rule: only an explicit human `UPDATE_GOLDEN=1` may write. Everything
 * else compares, and a missing reference fails.
 */
export type SnapshotAction = "write" | "compare" | "fail";

export function snapshotAction(opts: { exists: boolean; update: boolean }): SnapshotAction {
  if (opts.update) return "write";
  return opts.exists ? "compare" : "fail";
}

export function missingSnapshotMessage(label: string): string {
  return (
    `no committed snapshot for ${label} — refusing to write one and assert against it. ` +
    `A snapshot is a photograph of what Lyse said when a human last looked; generating ` +
    `it here would compare the current output to itself. Regenerate deliberately with ` +
    `UPDATE_GOLDEN=1 LYSE_GOLDEN=1 pnpm -F lyse test tests/golden/ and review the diff.`
  );
}
