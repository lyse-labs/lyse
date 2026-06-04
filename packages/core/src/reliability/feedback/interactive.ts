import { execSync } from "node:child_process";
import prompts from "prompts";
import type { Finding } from "../../types.js";
import { SUB_AXES } from "../catalogue/sub-axes.js";
import { sendFeedback, type FeedbackVerdict } from "./sender.js";
import { telemetryEnabled } from "../../telemetry/index.js";

const DEFAULT_FEEDBACK_ENDPOINT = "https://api.getlyse.com/v1/feedback";
const DEFAULT_SALT_URL = "https://api.getlyse.com/v1/bucket-salt";
const SALT_FETCH_TIMEOUT_MS = 3000;

export interface InteractiveFeedbackResult {
  sent: number;
  skipped: number;
  aborted: boolean;
}

// Build a ruleId → subAxisId lookup from the seeded catalogue.
// Rules without a sub-axis mapping are reported with subAxisId="unmapped"
// so the worker can still aggregate them under a tracking bucket.
const RULE_TO_SUB_AXIS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const sa of SUB_AXES) {
    for (const r of sa.ruleIds) m.set(r, sa.id);
  }
  return m;
})();

export function getSubAxisForRule(ruleId: string): string {
  return RULE_TO_SUB_AXIS.get(ruleId) ?? "unmapped";
}

export function getFeedbackEndpoint(): string {
  const override = process.env["LYSE_FEEDBACK_ENDPOINT"];
  return override && override.length > 0 ? override : DEFAULT_FEEDBACK_ENDPOINT;
}

export function getSaltUrl(): string {
  const override = process.env["LYSE_FEEDBACK_SALT_URL"];
  return override && override.length > 0 ? override : DEFAULT_SALT_URL;
}

export async function fetchBucketSalt(url: string, timeoutMs: number = SALT_FETCH_TIMEOUT_MS): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const txt = (await res.text()).trim();
    if (txt.length === 0) return null;
    try {
      const parsed = JSON.parse(txt) as { salt?: unknown };
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed.salt === "string") return parsed.salt;
    } catch {
      // Not JSON — treat as raw salt string.
    }
    return txt;
  } catch {
    return null;
  }
}

export function getRemoteOriginUrl(repoRoot: string): string | null {
  try {
    const out = execSync("git config --get remote.origin.url", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export interface RunInteractiveFeedbackOpts {
  findings: Finding[];
  repoRoot: string;
  endpoint?: string;
  saltUrl?: string;
  // Test-injection seam — when provided, skips the network fetch.
  saltOverride?: string;
  remoteUrlOverride?: string;
}

type PromptVerdict = "valid" | "invalid" | "unsure" | "skipped" | "quit";

// Runs an interactive y/n/?/s/q prompt for each finding. Sends a privacy-clean
// telemetry event per verdict when consent has been accepted; otherwise the
// prompts run but no network requests are made (still useful for local triage).
export async function runInteractiveFeedback(opts: RunInteractiveFeedbackOpts): Promise<InteractiveFeedbackResult> {
  const findings = opts.findings;
  if (findings.length === 0) return { sent: 0, skipped: 0, aborted: false };

  const endpoint = opts.endpoint ?? getFeedbackEndpoint();
  const telemetryOn = telemetryEnabled();

  let salt: string | null = opts.saltOverride ?? null;
  let remoteUrl: string | null = opts.remoteUrlOverride ?? null;

  if (telemetryOn) {
    if (!remoteUrl) remoteUrl = getRemoteOriginUrl(opts.repoRoot);
    if (!salt) salt = await fetchBucketSalt(opts.saltUrl ?? getSaltUrl());
    if (!salt || !remoteUrl) {
      process.stdout.write("[telemetry: salt unavailable; feedback disabled this session]\n");
    }
  }

  const canSend = telemetryOn && !!salt && !!remoteUrl;

  process.stdout.write(`\nInteractive review: ${findings.length} finding${findings.length === 1 ? "" : "s"}.\n`);
  process.stdout.write("  y=valid · n=invalid · ?=not sure · s=skip · q=quit\n");

  let sent = 0;
  let skipped = 0;
  let aborted = false;

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]!;
    process.stdout.write(
      `\n[${i + 1}/${findings.length}] ${f.location.file}:${f.location.line}  ${f.severity}  ${f.ruleId}\n`,
    );
    if (f.message) process.stdout.write(`  ${f.message}\n`);

    const r = await prompts({
      type: "select",
      name: "v",
      message: "Is this a real issue?",
      choices: [
        { title: "y · valid (real issue)", value: "valid" },
        { title: "n · invalid (false positive)", value: "invalid" },
        { title: "? · not sure (skip)", value: "unsure" },
        { title: "s · skip silently", value: "skipped" },
        { title: "q · quit interactive mode", value: "quit" },
      ],
      initial: 0,
    });
    const verdict = r.v as PromptVerdict | undefined;

    if (verdict === undefined || verdict === "quit") {
      aborted = true;
      break;
    }
    if (verdict === "unsure" || verdict === "skipped") {
      skipped++;
      continue;
    }

    if (!canSend) {
      skipped++;
      continue;
    }

    const subAxisId = getSubAxisForRule(f.ruleId);
    const res = await sendFeedback({
      endpoint,
      finding: { ruleId: f.ruleId, subAxisId },
      verdict: verdict as FeedbackVerdict,
      remoteUrl: remoteUrl!,
      salt: salt!,
    });
    if (res.ok) sent++;
    else skipped++;
  }

  if (canSend) {
    process.stdout.write(`\nFeedback session: ${sent} sent, ${skipped} skipped.\n`);
  } else if (telemetryOn) {
    process.stdout.write(`\nFeedback session: ${skipped} reviewed locally (telemetry disabled).\n`);
  } else {
    process.stdout.write(`\nFeedback session: ${skipped} reviewed locally (run \`lyse telemetry on\` to share anonymized verdicts).\n`);
  }

  return { sent, skipped, aborted };
}
