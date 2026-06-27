import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { computeRepoBucketFromUrl as computeRepoBucket } from "../identity/index.js";
import {
  fetchBucketSalt,
  getRemoteOriginUrl,
  getSaltUrl,
} from "../reliability/feedback/interactive.js";
import { confirm } from "../menu/prompts.js";
import { telemetryEnabled } from "../telemetry/index.js";

const DEFAULT_MISSED_ENDPOINT = "https://api.getlyse.com/v1/missed-finding";
const SNIPPET_MAX_CHARS = 120;

export interface FeedbackMissedArgs {
  cwd: string;
  // Spec form: <file>:<line>
  missed: string;
  // Optional sub-axis the user thinks should have caught this.
  subAxisId?: string;
  // Skip the y/n confirmation banner (used by tests).
  autoConfirm?: boolean;
  endpoint?: string;
  saltUrl?: string;
  // Test injection: override the salt + remoteUrl so we don't hit the network.
  saltOverride?: string;
  remoteUrlOverride?: string;
  // Test injection: replace fetch.
  fetcher?: typeof fetch;
}

export interface FeedbackMissedPayload {
  file: string;
  line: number;
  snippet: string;
  subAxisId: string;
  repoBucket: string;
  ts: number;
}

interface ParsedMissedSpec {
  file: string;
  line: number;
}

export function parseMissedSpec(spec: string): ParsedMissedSpec | null {
  const idx = spec.lastIndexOf(":");
  if (idx < 0) return null;
  const file = spec.slice(0, idx);
  const lineStr = spec.slice(idx + 1);
  const line = Number(lineStr);
  if (!file || !Number.isInteger(line) || line < 1) return null;
  return { file, line };
}

export function extractSnippet(content: string, line: number): string {
  const lines = content.split("\n");
  const raw = lines[line - 1] ?? "";
  if (raw.length <= SNIPPET_MAX_CHARS) return raw;
  return raw.slice(0, SNIPPET_MAX_CHARS) + "…";
}

export function getMissedEndpoint(): string {
  const override = process.env["LYSE_MISSED_ENDPOINT"];
  return override && override.length > 0 ? override : DEFAULT_MISSED_ENDPOINT;
}

export async function feedbackMissed(args: FeedbackMissedArgs): Promise<{ ok: boolean; reason?: string }> {
  if (!telemetryEnabled()) {
    process.stderr.write(
      "lyse feedback --missed requires telemetry consent.\n" +
        "Sending a missed-finding report uploads ONE line of source code to api.getlyse.com so it can be hand-labelled.\n" +
        "Run `lyse telemetry on` to opt in for this command.\n",
    );
    return { ok: false, reason: "telemetry-disabled" };
  }

  const parsed = parseMissedSpec(args.missed);
  if (!parsed) {
    process.stderr.write(`Invalid --missed value: ${args.missed}. Expected <file>:<line>.\n`);
    return { ok: false, reason: "invalid-spec" };
  }

  const repoRoot = resolve(args.cwd);
  const absPath = resolve(repoRoot, parsed.file);
  if (!existsSync(absPath)) {
    process.stderr.write(`File not found: ${parsed.file}\n`);
    return { ok: false, reason: "file-not-found" };
  }

  let content: string;
  try {
    content = await readFile(absPath, "utf8");
  } catch (err) {
    process.stderr.write(`Could not read ${parsed.file}: ${(err as Error).message}\n`);
    return { ok: false, reason: "read-error" };
  }

  const snippet = extractSnippet(content, parsed.line);
  if (!snippet || snippet.trim().length === 0) {
    process.stderr.write(`Line ${parsed.line} of ${parsed.file} is empty.\n`);
    return { ok: false, reason: "empty-line" };
  }

  // Client-side secret heuristic — refuse to even prompt for upload if the
  // line or file looks like credentials. Defense in depth (the worker also
  // screens server-side; the two pattern lists are kept in sync manually).
  const SECRET_SUBSTRING_PATTERNS = [
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
    /api[_-]?key\s*[:=]/i,
    /secret\s*[:=]/i,
    /token\s*[:=]/i,
    /password\s*[:=]/i,
    /authorization\s*:\s*bearer\s+/i,
    /(aws|gcp|azure)[_-](access|secret|session)/i,
    /[A-Za-z0-9+/]{40,}={0,2}/,
  ];
  const SENSITIVE_FILE_PATTERNS = [
    /(^|\/)\.env(\.|$)/,
    /(^|\/)\.npmrc$/,
    /\.pem$/i,
    /\.key$/i,
    /credentials/i,
    /secrets?[/_-]/i,
  ];
  if (SENSITIVE_FILE_PATTERNS.some((re) => re.test(parsed.file))) {
    process.stderr.write(
      `Refusing to upload from a sensitive file (${parsed.file}). lyse feedback --missed will not send .env/keys/credentials.\n`,
    );
    return { ok: false, reason: "sensitive-file" };
  }
  if (SECRET_SUBSTRING_PATTERNS.some((re) => re.test(snippet))) {
    process.stderr.write(
      `Refusing to upload: line ${parsed.line} of ${parsed.file} matches a secret heuristic (api_key/secret/bearer/pem/etc.). If this is a false positive, please file an issue with a redacted example.\n`,
    );
    return { ok: false, reason: "secret-detected" };
  }

  if (!args.autoConfirm) {
    // Show the EXACT snippet content the user is about to upload — so they can
    // veto if the heuristic missed something. The reviewer flagged that hiding
    // the line behind "<1 line>" was a meaningful UX gap (#76 review A2).
    const truncated = snippet.length > 120 ? snippet.slice(0, 117) + "..." : snippet;
    const banner = [
      "",
      `This will upload 1 line of source code (${snippet.length} chars) to api.getlyse.com`,
      "for the hand-label queue.",
      "",
      "  Payload preview:",
      `    file:       ${parsed.file}`,
      `    line:       ${parsed.line}`,
      `    snippet:    ${JSON.stringify(truncated)}`,
      `    subAxisId:  ${args.subAxisId ?? "unmapped"}`,
      `    repoBucket: <HMAC-SHA256 16-hex>`,
      "",
      "Privacy: https://getlyse.com/privacy  (no IP, no other code, no remote URL)",
      "",
    ].join("\n");
    process.stdout.write(banner);
    const proceed = await confirm("Send missed-finding report?", false);
    if (!proceed) {
      process.stdout.write("Aborted (nothing sent).\n");
      return { ok: false, reason: "user-declined" };
    }
  }

  const remoteUrl = args.remoteUrlOverride ?? getRemoteOriginUrl(repoRoot);
  const salt = args.saltOverride ?? (await fetchBucketSalt(args.saltUrl ?? getSaltUrl()));

  if (!remoteUrl || !salt) {
    process.stderr.write("Could not derive an anonymous repo bucket (missing git remote or salt). Nothing sent.\n");
    return { ok: false, reason: "bucket-unavailable" };
  }

  const repoBucket = computeRepoBucket(remoteUrl, salt);
  const payload: FeedbackMissedPayload = {
    file: parsed.file,
    line: parsed.line,
    snippet,
    subAxisId: args.subAxisId ?? "unmapped",
    repoBucket,
    ts: Date.now(),
  };

  const endpoint = args.endpoint ?? getMissedEndpoint();
  const fetcher = args.fetcher ?? fetch;
  try {
    const res = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      process.stderr.write(`Server returned ${res.status}; missed-finding not queued.\n`);
      return { ok: false, reason: `http-${res.status}` };
    }
  } catch (err) {
    process.stderr.write(`Network error: ${(err as Error).message}\n`);
    return { ok: false, reason: "network-error" };
  }

  process.stdout.write("Thanks! Missed finding queued for the hand-label queue.\n");
  return { ok: true };
}
