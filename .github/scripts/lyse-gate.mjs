#!/usr/bin/env node
// Lyse CI gate: compares the PR's audit report against main's,
// writes a markdown comment to stdout, and exits non-zero on regression.
//
// Usage:
//   node lyse-gate.mjs <main-report.json> <pr-report.json> [--threshold=N]
//
// Threshold defaults to 0 (no regression allowed). A threshold of 5 would
// tolerate up to a 5-point drop in finalScore.
//
// Exit codes:
//   0 — no regression (score >= main - threshold)
//   1 — regression detected (score < main - threshold)
//   2 — usage error (bad args, unreadable file, malformed JSON, malformed report)

import { readFileSync } from "node:fs";

function die(code, msg) {
  process.stderr.write(`lyse-gate: ${msg}\n`);
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
    die(2, `cannot read ${path}: ${e.message}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    die(2, `${path} is not valid JSON: ${e.message}`);
  }
  if (json === null || typeof json !== "object") {
    die(2, `${path}: report must be a JSON object`);
  }
  if (!isFiniteScore(json.finalScore) && json.finalScore !== "N/A") {
    die(2, `${path}: .finalScore must be a number or "N/A" (got: ${JSON.stringify(json.finalScore)})`);
  }
  if (!Array.isArray(json.axes)) {
    die(2, `${path}: .axes must be an array`);
  }
  for (const [i, a] of json.axes.entries()) {
    if (!a || typeof a !== "object") die(2, `${path}: .axes[${i}] must be an object`);
    if (typeof a.axis !== "string" || !a.axis) die(2, `${path}: .axes[${i}].axis must be a non-empty string`);
    if (!isFiniteScore(a.score) && a.score !== "N/A") {
      die(2, `${path}: .axes[${i}].score must be a number or "N/A"`);
    }
  }
  if (!Array.isArray(json.findings)) {
    die(2, `${path}: .findings must be an array`);
  }
  return json;
}

function parseThreshold(argv) {
  const flag = argv.find((a) => a.startsWith("--threshold="));
  if (!flag) return 0;
  const n = Number(flag.split("=")[1]);
  if (!Number.isFinite(n) || n < 0) {
    die(2, `--threshold must be a non-negative number, got: ${flag}`);
  }
  return n;
}

function findingKey(f) {
  // Stable key per finding so we can detect new/fixed across runs.
  // Same (ruleId, file, line, column, message) → same finding instance.
  const loc = f.location ?? {};
  return `${f.ruleId ?? ""}|${loc.file ?? ""}|${loc.line ?? 0}|${loc.column ?? 0}|${f.message ?? ""}`;
}

function indexFindings(findings) {
  // Use Map<key, Finding[]> so duplicates (same key, different occurrence)
  // are counted, not collapsed.
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
  // For each key in pr, count = max(0, pr_count - main_count) → introduced
  for (const [k, prArr] of prIdx) {
    const mainCount = mainIdx.get(k)?.length ?? 0;
    const introducedHere = prArr.length - mainCount;
    if (introducedHere > 0) introduced.push(...prArr.slice(0, introducedHere));
  }
  // For each key in main, count = max(0, main_count - pr_count) → fixed
  for (const [k, mainArr] of mainIdx) {
    const prCount = prIdx.get(k)?.length ?? 0;
    const fixedHere = mainArr.length - prCount;
    if (fixedHere > 0) fixed.push(...mainArr.slice(0, fixedHere));
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
    if (seen.has(a.axis)) continue; // first wins, deterministic
    seen.add(a.axis);
    m[a.axis] = a;
  }
  return m;
}

function fmtScore(s) {
  return s === null || s === "N/A" ? "N/A" : String(s);
}

function fmtDelta(delta) {
  if (delta === null) return "—";
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return "±0";
}

function emoji(delta, threshold) {
  if (delta === null) return "❓";
  if (delta < -threshold) return "❌";
  if (delta < 0) return "⚠️";
  if (delta === 0) return "✅";
  return "🎉";
}

// Escape markdown special chars + neutralize HTML to prevent injection
// via finding messages (which may include user-controlled content like
// custom token names, file paths, etc.).
function mdEscape(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))
    .replace(/`/g, "\\`")
    .replace(/[*_~|]/g, (c) => `\\${c}`);
}

function fmtFinding(f) {
  const loc = f.location ?? {};
  const where = loc.file ? ` — \`${mdEscape(String(loc.file))}:${loc.line ?? "?"}\`` : "";
  const sev = String(f.severity ?? "warning").toUpperCase();
  const sevEsc = mdEscape(sev);
  const ruleId = mdEscape(String(f.ruleId ?? "(unknown)"));
  const msg = mdEscape(String(f.message ?? "(no message)"));
  return `- **[${sevEsc}]** \`${ruleId}\`${where}: ${msg}`;
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
      return `| \`${mdEscape(name)}\` | ${fmtScore(mn)} | ${fmtScore(pn)} | ${fmtDelta(d)} |`;
    })
    .join("\n");

  const regressed = delta !== null && delta < -threshold;

  const header = regressed
    ? `## ${e} Lyse audit — regression detected\n\nThis PR drops the Health Score from **${fmtScore(mainScore)}** to **${fmtScore(prScore)}** (delta **${fmtDelta(delta)}**, threshold **−${threshold}**).`
    : `## ${e} Lyse audit — no regression\n\nHealth Score: **${fmtScore(mainScore)}** → **${fmtScore(prScore)}** (delta **${fmtDelta(delta)}**, threshold **−${threshold}**).`;

  const introducedSection = diff.introduced.length
    ? `### New findings (${diff.introduced.length})\n\n${diff.introduced.slice(0, 20).map(fmtFinding).join("\n")}${diff.introduced.length > 20 ? `\n\n_…and ${diff.introduced.length - 20} more — see the uploaded artifact for the full list._` : ""}`
    : `### New findings\n\nNone. ✅`;

  const fixedSection = diff.fixed.length
    ? `### Fixed findings (${diff.fixed.length}) 🎉\n\n${diff.fixed.slice(0, 10).map(fmtFinding).join("\n")}`
    : "";

  const scoringWarn =
    main.scoringVersion && pr.scoringVersion && main.scoringVersion !== pr.scoringVersion
      ? `\n> ⚠️ scoringVersion differs between main (\`${mdEscape(main.scoringVersion)}\`) and PR (\`${mdEscape(pr.scoringVersion)}\`) — score comparison may not be meaningful.`
      : "";

  const footer = `\n---\n_Posted by \`lyse-gate.mjs\` · threshold \`${threshold}\` · scoring \`${mdEscape(String(pr.scoringVersion ?? "?"))}\`_`;

  return [
    header,
    scoringWarn,
    "",
    "| Axis | main | PR | delta |",
    "|---|---|---|---|",
    axesTable,
    "",
    introducedSection,
    fixedSection,
    footer,
  ]
    .filter((s) => s !== "")
    .join("\n");
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

  process.stdout.write(comment + "\n");

  const mainScore = scoreOf(mainReport);
  const prScore = scoreOf(prReport);
  if (mainScore !== null && prScore !== null && prScore < mainScore - threshold) {
    process.stderr.write(`lyse-gate: regression ${mainScore} → ${prScore} (threshold -${threshold})\n`);
    process.exit(1);
  }
  process.exit(0);
}

main(process.argv);
