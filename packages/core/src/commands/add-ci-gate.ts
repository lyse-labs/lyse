// `lyse add ci-gate` — install the Lyse score-regression CI gate into the
// user's repo. Drops two files:
//   .github/workflows/lyse.yml      (audits PR + main, posts comment, fails on regression)
//   .github/scripts/lyse-gate.mjs   (the comparator script)
//
// Templates are inlined as string constants so we don't depend on a runtime
// templates/ folder being shipped intact through the npm publish pipeline.
// When the templates change, edit the constants below.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export interface AddCiGateOptions {
  /** Repo root where the .github/ folder should land. */
  cwd: string;
  /** Override the default `npx --yes @lyse-labs/lyse@<v>` pin in the workflow. */
  lyseVersion?: string;
  /** Max allowed score drop before the gate fails. Default 0. */
  threshold?: number;
  /** Overwrite existing files instead of refusing. */
  force?: boolean;
}

export interface AddCiGateResult {
  written: string[];
  skipped: { path: string; reason: string }[];
}

export class AddCiGateError extends Error {}

export const CI_GATE_DEFAULTS = {
  lyseVersion: "alpha",
  threshold: 0,
} as const;

export function runAddCiGate(opts: AddCiGateOptions): AddCiGateResult {
  const cwd = resolve(opts.cwd);
  if (!existsSync(cwd)) {
    throw new AddCiGateError(`Target directory does not exist: ${cwd}`);
  }

  const lyseVersion = opts.lyseVersion ?? CI_GATE_DEFAULTS.lyseVersion;
  const threshold = opts.threshold ?? CI_GATE_DEFAULTS.threshold;
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new AddCiGateError(`--threshold must be a non-negative number (got: ${threshold})`);
  }

  const workflowPath = join(cwd, ".github/workflows/lyse.yml");
  const scriptPath = join(cwd, ".github/scripts/lyse-gate.mjs");

  const written: string[] = [];
  const skipped: { path: string; reason: string }[] = [];

  // Refuse to overwrite unless --force.
  if (existsSync(workflowPath) && !opts.force) {
    skipped.push({ path: relative(cwd, workflowPath), reason: "already exists (pass --force to overwrite)" });
  } else {
    mkdirSync(dirname(workflowPath), { recursive: true });
    writeFileSync(workflowPath, renderWorkflow({ lyseVersion, threshold }), "utf8");
    written.push(relative(cwd, workflowPath));
  }

  if (existsSync(scriptPath) && !opts.force) {
    skipped.push({ path: relative(cwd, scriptPath), reason: "already exists (pass --force to overwrite)" });
  } else {
    mkdirSync(dirname(scriptPath), { recursive: true });
    writeFileSync(scriptPath, GATE_SCRIPT, "utf8");
    written.push(relative(cwd, scriptPath));
  }

  return { written, skipped };
}

function renderWorkflow(args: { lyseVersion: string; threshold: number }): string {
  return WORKFLOW_TEMPLATE.replace(/__LYSE_VERSION__/g, args.lyseVersion).replace(
    /__THRESHOLD__/g,
    String(args.threshold),
  );
}

// -----------------------------------------------------------------------------
// Templates (inlined so they survive the npm publish pipeline cleanly)
// -----------------------------------------------------------------------------

const WORKFLOW_TEMPLATE = `name: Lyse audit

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

# Pin the Lyse CLI version so both audits in a single run use the same
# scorer + rule set. Bump LYSE_VERSION when you want CI to track a new
# alpha. Avoid \`@alpha\` here in production — that tag can move between
# the two \`npx\` invocations and produce non-comparable reports.
env:
  LYSE_VERSION: "__LYSE_VERSION__"
  GATE_THRESHOLD: "__THRESHOLD__"

concurrency:
  group: lyse-gate-\${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: true

jobs:
  audit-push:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: Lyse audit
        run: npx --yes "@lyse-labs/lyse@\${{ env.LYSE_VERSION }}" audit --format=json > lyse-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: lyse-report-main
          path: lyse-report.json

  gate:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout PR
        uses: actions/checkout@v6
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          path: pr
      - name: Checkout main
        uses: actions/checkout@v6
        with:
          ref: main
          path: main
      - uses: actions/setup-node@v6
        with:
          node-version: 22

      - name: Audit PR
        working-directory: pr
        run: npx --yes "@lyse-labs/lyse@\${{ env.LYSE_VERSION }}" audit --format=json > ../pr-report.json

      # Best-effort baseline: if main does not audit (e.g. lockfile is broken
      # or a rule throws), the gate is skipped (not failed) so the PR that
      # would FIX main is not blocked. The PR comment surfaces "baseline
      # unavailable" instead.
      - name: Audit main (best-effort baseline)
        id: audit_main
        working-directory: main
        run: |
          set +e
          npx --yes "@lyse-labs/lyse@\${{ env.LYSE_VERSION }}" audit --format=json > ../main-report.json
          echo "ok=$?" >> $GITHUB_OUTPUT

      - name: Run gate
        id: gate
        if: steps.audit_main.outputs.ok == '0'
        run: node pr/.github/scripts/lyse-gate.mjs main-report.json pr-report.json --threshold=\${{ env.GATE_THRESHOLD }} > comment.md
        continue-on-error: true

      - name: Build baseline-unavailable comment
        if: steps.audit_main.outputs.ok != '0'
        run: |
          cat > comment.md <<'MD'
          ## ❓ Lyse audit — baseline unavailable

          Could not audit \`main\` to compute a regression baseline. The PR
          was audited (artifact attached) but the gate is **skipped** for
          this run. This usually means \`main\` does not currently audit
          cleanly — investigate separately.
          MD

      # Fork PRs get a read-only GITHUB_TOKEN regardless of \`permissions:\`,
      # so we skip the comment step rather than fail the workflow.
      - name: Detect fork PR
        id: fork_check
        run: |
          IS_FORK="\${{ github.event.pull_request.head.repo.full_name != github.repository }}"
          echo "is_fork=$IS_FORK" >> $GITHUB_OUTPUT

      - name: Post PR comment
        if: always() && steps.fork_check.outputs.is_fork == 'false'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          REPO: \${{ github.repository }}
        run: |
          MARKER='<!-- lyse-gate-comment -->'
          printf '%s\\n' "$MARKER" > comment-with-marker.md
          cat comment.md >> comment-with-marker.md
          EXISTING=$(gh api "repos/$REPO/issues/$PR_NUMBER/comments" \\
            --jq ".[] | select(.user.login == \\"github-actions[bot]\\") | select(.body | startswith(\\"$MARKER\\")) | .id" \\
            | head -1)
          BODY_JSON=$(jq -Rs '{body: .}' < comment-with-marker.md)
          if [ -n "$EXISTING" ]; then
            printf '%s' "$BODY_JSON" | gh api -X PATCH "repos/$REPO/issues/comments/$EXISTING" --input -
          else
            printf '%s' "$BODY_JSON" | gh api -X POST "repos/$REPO/issues/$PR_NUMBER/comments" --input -
          fi

      - name: Skip comment notice (fork PR)
        if: steps.fork_check.outputs.is_fork == 'true'
        run: |
          echo "::warning::Skipping PR comment — fork PRs get a read-only GITHUB_TOKEN."
          echo "::warning::See the uploaded artifact for the full report."

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lyse-reports
          path: |
            main-report.json
            pr-report.json
            comment.md
          if-no-files-found: warn

      - name: Fail on regression
        if: steps.gate.outcome == 'failure'
        run: |
          echo "::error::Lyse gate detected a regression — see the PR comment for details."
          exit 1
`;

const GATE_SCRIPT = `#!/usr/bin/env node
// Lyse CI gate: compares the PR's audit report against main's, writes a
// markdown comment to stdout, and exits non-zero on regression.
//
// Usage:
//   node lyse-gate.mjs <main-report.json> <pr-report.json> [--threshold=N]
//
// Exit codes:
//   0 — no regression (score >= main - threshold)
//   1 — regression detected (score < main - threshold)
//   2 — usage error (bad args, unreadable file, malformed JSON)
//
// Generated by \`lyse add ci-gate\`. Re-run \`lyse add ci-gate --force\` to
// refresh.

import { readFileSync } from "node:fs";

function die(code, msg) {
  process.stderr.write(\`lyse-gate: \${msg}\\n\`);
  process.exit(code);
}

function isFiniteScore(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function loadReport(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    die(2, \`cannot read \${path}: \${e.message}\`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    die(2, \`\${path} is not valid JSON: \${e.message}\`);
  }
  if (json === null || typeof json !== "object") die(2, \`\${path}: report must be an object\`);
  if (!isFiniteScore(json.finalScore) && json.finalScore !== "N/A") {
    die(2, \`\${path}: .finalScore must be a number or "N/A"\`);
  }
  if (!Array.isArray(json.axes)) die(2, \`\${path}: .axes must be an array\`);
  for (const [i, a] of json.axes.entries()) {
    if (!a || typeof a !== "object") die(2, \`\${path}: .axes[\${i}] must be an object\`);
    if (typeof a.axis !== "string" || !a.axis) die(2, \`\${path}: .axes[\${i}].axis must be a non-empty string\`);
    if (!isFiniteScore(a.score) && a.score !== "N/A") die(2, \`\${path}: .axes[\${i}].score must be a number or "N/A"\`);
  }
  if (!Array.isArray(json.findings)) die(2, \`\${path}: .findings must be an array\`);
  return json;
}

function parseThreshold(argv) {
  const flag = argv.find((a) => a.startsWith("--threshold="));
  if (!flag) return 0;
  const n = Number(flag.split("=")[1]);
  if (!Number.isFinite(n) || n < 0) die(2, \`--threshold must be a non-negative number, got: \${flag}\`);
  return n;
}

function findingKey(f) {
  const loc = f.location ?? {};
  return \`\${f.ruleId ?? ""}|\${loc.file ?? ""}|\${loc.line ?? 0}|\${loc.column ?? 0}|\${f.message ?? ""}\`;
}

function indexFindings(findings) {
  const map = new Map();
  for (const f of findings) {
    const k = findingKey(f);
    const arr = map.get(k);
    if (arr) arr.push(f);
    else map.set(k, [f]);
  }
  return map;
}

function diffFindings(mainReport, prReport) {
  const mainIdx = indexFindings(mainReport.findings);
  const prIdx = indexFindings(prReport.findings);
  const introduced = [];
  const fixed = [];
  for (const [k, prArr] of prIdx) {
    const mc = mainIdx.get(k)?.length ?? 0;
    const n = prArr.length - mc;
    if (n > 0) introduced.push(...prArr.slice(0, n));
  }
  for (const [k, mainArr] of mainIdx) {
    const pc = prIdx.get(k)?.length ?? 0;
    const n = mainArr.length - pc;
    if (n > 0) fixed.push(...mainArr.slice(0, n));
  }
  return { introduced, fixed };
}

function scoreOf(report) {
  return isFiniteScore(report.finalScore) ? report.finalScore : null;
}

function axesByName(report) {
  const m = {};
  const seen = new Set();
  for (const a of report.axes) {
    if (seen.has(a.axis)) continue;
    seen.add(a.axis);
    m[a.axis] = a;
  }
  return m;
}

const fmtScore = (s) => (s === null || s === "N/A" ? "N/A" : String(s));
const fmtDelta = (d) => (d === null ? "—" : d > 0 ? \`+\${d}\` : d < 0 ? String(d) : "±0");
const emoji = (d, t) => (d === null ? "❓" : d < -t ? "❌" : d < 0 ? "⚠️" : d === 0 ? "✅" : "🎉");

function mdEscape(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))
    .replace(/\`/g, "\\\\\`")
    .replace(/[*_~|]/g, (c) => \`\\\\\${c}\`);
}

function fmtFinding(f) {
  const loc = f.location ?? {};
  const where = loc.file ? \` — \\\`\${mdEscape(String(loc.file))}:\${loc.line ?? "?"}\\\`\` : "";
  const sev = mdEscape(String(f.severity ?? "warning").toUpperCase());
  const ruleId = mdEscape(String(f.ruleId ?? "(unknown)"));
  const msg = mdEscape(String(f.message ?? "(no message)"));
  return \`- **[\${sev}]** \\\`\${ruleId}\\\`\${where}: \${msg}\`;
}

function buildComment({ main, pr, threshold, diff }) {
  const mainScore = scoreOf(main);
  const prScore = scoreOf(pr);
  const delta = mainScore !== null && prScore !== null ? prScore - mainScore : null;
  const e = emoji(delta, threshold);

  const mainAxes = axesByName(main);
  const prAxes = axesByName(pr);
  const allAxes = Array.from(new Set([...Object.keys(mainAxes), ...Object.keys(prAxes)])).sort();

  const axesTable = allAxes
    .map((name) => {
      const m = mainAxes[name]?.score;
      const p = prAxes[name]?.score;
      const mn = isFiniteScore(m) ? m : null;
      const pn = isFiniteScore(p) ? p : null;
      const d = mn !== null && pn !== null ? pn - mn : null;
      return \`| \\\`\${mdEscape(name)}\\\` | \${fmtScore(mn)} | \${fmtScore(pn)} | \${fmtDelta(d)} |\`;
    })
    .join("\\n");

  const regressed = delta !== null && delta < -threshold;
  const header = regressed
    ? \`## \${e} Lyse audit — regression detected\\n\\nThis PR drops the Health Score from **\${fmtScore(mainScore)}** to **\${fmtScore(prScore)}** (delta **\${fmtDelta(delta)}**, threshold **−\${threshold}**).\`
    : \`## \${e} Lyse audit — no regression\\n\\nHealth Score: **\${fmtScore(mainScore)}** → **\${fmtScore(prScore)}** (delta **\${fmtDelta(delta)}**, threshold **−\${threshold}**).\`;

  const introducedSection = diff.introduced.length
    ? \`### New findings (\${diff.introduced.length})\\n\\n\${diff.introduced.slice(0, 20).map(fmtFinding).join("\\n")}\${diff.introduced.length > 20 ? \`\\n\\n_…and \${diff.introduced.length - 20} more — see the uploaded artifact._\` : ""}\`
    : \`### New findings\\n\\nNone. ✅\`;

  const fixedSection = diff.fixed.length
    ? \`### Fixed findings (\${diff.fixed.length}) 🎉\\n\\n\${diff.fixed.slice(0, 10).map(fmtFinding).join("\\n")}\`
    : "";

  const scoringWarn =
    main.scoringVersion && pr.scoringVersion && main.scoringVersion !== pr.scoringVersion
      ? \`\\n> ⚠️ scoringVersion differs between main (\\\`\${mdEscape(main.scoringVersion)}\\\`) and PR (\\\`\${mdEscape(pr.scoringVersion)}\\\`) — score comparison may not be meaningful.\`
      : "";

  const footer = \`\\n---\\n_Posted by \\\`lyse-gate.mjs\\\` · threshold \\\`\${threshold}\\\` · scoring \\\`\${mdEscape(String(pr.scoringVersion ?? "?"))}\\\`_\`;

  return [header, scoringWarn, "", "| Axis | main | PR | delta |", "|---|---|---|---|", axesTable, "", introducedSection, fixedSection, footer]
    .filter((s) => s !== "")
    .join("\\n");
}

function main(argv) {
  const positional = argv.slice(2).filter((a) => !a.startsWith("--"));
  if (positional.length !== 2) {
    die(2, "usage: lyse-gate.mjs <main-report.json> <pr-report.json> [--threshold=N]");
  }
  const [mainPath, prPath] = positional;
  const threshold = parseThreshold(argv);

  const mainReport = loadReport(mainPath);
  const prReport = loadReport(prPath);
  const diff = diffFindings(mainReport, prReport);
  const comment = buildComment({ main: mainReport, pr: prReport, threshold, diff });

  process.stdout.write(comment + "\\n");

  const mainScore = scoreOf(mainReport);
  const prScore = scoreOf(prReport);
  if (mainScore !== null && prScore !== null && prScore < mainScore - threshold) {
    process.stderr.write(\`lyse-gate: regression \${mainScore} → \${prScore} (threshold -\${threshold})\\n\`);
    process.exit(1);
  }
  process.exit(0);
}

main(process.argv);
`;
