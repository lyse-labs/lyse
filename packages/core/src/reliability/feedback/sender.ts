import { computeRepoBucket } from "./repo-bucket.js";
import { telemetryEnabled } from "../../telemetry/index.js";

export type FeedbackVerdict = "valid" | "invalid" | "skipped";

export interface FeedbackFinding {
  ruleId: string;
  subAxisId: string;
}

export interface SendFeedbackArgs {
  endpoint: string;
  finding: FeedbackFinding;
  verdict: FeedbackVerdict;
  remoteUrl: string;
  salt: string;
  timeoutMs?: number;
}

// Opt-in only: returns ok=false (without fetching) unless the user has accepted
// telemetry consent (~/.lyse/consent.json). Anything else disables the sender.
export async function sendFeedback(args: SendFeedbackArgs): Promise<{ ok: boolean }> {
  if (!telemetryEnabled()) return { ok: false };
  const repoBucket = computeRepoBucket(args.remoteUrl, args.salt);
  try {
    const res = await fetch(args.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ruleId: args.finding.ruleId,
        subAxisId: args.finding.subAxisId,
        repoBucket,
        verdict: args.verdict,
        signed: false,
      }),
      signal: AbortSignal.timeout(args.timeoutMs ?? 2000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
