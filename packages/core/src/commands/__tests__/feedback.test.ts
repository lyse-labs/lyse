import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  feedbackMissed,
  parseMissedSpec,
  extractSnippet,
  getMissedEndpoint,
} from "../feedback.js";
import { __setCacheForTest, resetConsentCache } from "../../telemetry/consent.js";

function enableConsent(): void {
  __setCacheForTest({ accepted: true, initialised: true });
}

describe("parseMissedSpec", () => {
  it("parses simple <file>:<line>", () => {
    expect(parseMissedSpec("Card.tsx:42")).toEqual({ file: "Card.tsx", line: 42 });
  });
  it("supports nested paths", () => {
    expect(parseMissedSpec("src/widgets/Card.tsx:7")).toEqual({
      file: "src/widgets/Card.tsx",
      line: 7,
    });
  });
  it("returns null for missing line", () => {
    expect(parseMissedSpec("Card.tsx")).toBeNull();
  });
  it("returns null for non-integer line", () => {
    expect(parseMissedSpec("Card.tsx:abc")).toBeNull();
  });
  it("returns null for zero or negative line", () => {
    expect(parseMissedSpec("Card.tsx:0")).toBeNull();
    expect(parseMissedSpec("Card.tsx:-1")).toBeNull();
  });
});

describe("extractSnippet", () => {
  it("returns the requested 1-based line", () => {
    expect(extractSnippet("a\nb\nc", 2)).toBe("b");
  });
  it("returns the empty string when out of range", () => {
    expect(extractSnippet("a\nb\nc", 99)).toBe("");
  });
  it("truncates lines longer than ~120 chars", () => {
    const long = "x".repeat(500);
    const r = extractSnippet(long, 1);
    expect(r.length).toBeLessThanOrEqual(121);
    expect(r.endsWith("…")).toBe(true);
  });
});

describe("getMissedEndpoint", () => {
  beforeEach(() => {
    delete process.env["LYSE_MISSED_ENDPOINT"];
  });
  it("defaults to api.getlyse.com", () => {
    expect(getMissedEndpoint()).toContain("api.getlyse.com");
    expect(getMissedEndpoint()).toContain("/v1/missed-finding");
  });
  it("honors the LYSE_MISSED_ENDPOINT env override", () => {
    process.env["LYSE_MISSED_ENDPOINT"] = "https://example.test/v1/x";
    expect(getMissedEndpoint()).toBe("https://example.test/v1/x");
  });
});

describe("feedbackMissed", () => {
  let tmp: string;
  let stderr: string[] = [];
  let stdout: string[] = [];

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "lyse-fbk-"));
    stderr = [];
    stdout = [];
    vi.spyOn(process.stderr, "write").mockImplementation((s: unknown) => {
      stderr.push(String(s));
      return true;
    });
    vi.spyOn(process.stdout, "write").mockImplementation((s: unknown) => {
      stdout.push(String(s));
      return true;
    });
    enableConsent();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
    resetConsentCache();
  });

  it("refuses without telemetry consent (privacy gate)", async () => {
    __setCacheForTest({ accepted: false, initialised: true });
    const r = await feedbackMissed({ cwd: tmp, missed: "x.tsx:1", autoConfirm: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("telemetry-disabled");
    expect(stderr.join("")).toContain("lyse telemetry on");
  });

  it("returns invalid-spec for malformed input", async () => {
    const r = await feedbackMissed({ cwd: tmp, missed: "no-line-here", autoConfirm: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid-spec");
  });

  it("returns file-not-found when the path does not exist", async () => {
    const r = await feedbackMissed({ cwd: tmp, missed: "missing.tsx:1", autoConfirm: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("file-not-found");
  });

  it("posts a privacy-clean payload with snippet + repoBucket(HMAC)", async () => {
    writeFileSync(join(tmp, "Card.tsx"), "line-one\nconst BG = '#1A1A1A';\nline-three\n");
    const calls: Array<[string, RequestInit]> = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push([String(input), init ?? {}]);
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;
    const r = await feedbackMissed({
      cwd: tmp,
      missed: "Card.tsx:2",
      autoConfirm: true,
      saltOverride: "test-salt",
      remoteUrlOverride: "https://github.com/example/repo.git",
      fetcher,
    });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]![1].body as string);
    expect(body.file).toBe("Card.tsx");
    expect(body.line).toBe(2);
    expect(body.snippet).toBe("const BG = '#1A1A1A';");
    expect(body.subAxisId).toBe("unmapped");
    expect(typeof body.repoBucket).toBe("string");
    expect(body.repoBucket).toMatch(/^[a-f0-9]{16}$/);
    expect(typeof body.ts).toBe("number");
    // Privacy: payload must NOT contain the raw remote URL.
    expect(JSON.stringify(body)).not.toContain("github.com");
  });

  it("accepts an explicit --subAxisId", async () => {
    writeFileSync(join(tmp, "Card.tsx"), "  background: #1A1A1A;\n");
    const calls: Array<[string, RequestInit]> = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push([String(input), init ?? {}]);
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;
    const r = await feedbackMissed({
      cwd: tmp,
      missed: "Card.tsx:1",
      subAxisId: "tokens.color",
      autoConfirm: true,
      saltOverride: "s",
      remoteUrlOverride: "https://github.com/example/repo",
      fetcher,
    });
    expect(r.ok).toBe(true);
    const body = JSON.parse(calls[0]![1].body as string);
    expect(body.subAxisId).toBe("tokens.color");
  });

  it("propagates HTTP failure from the server", async () => {
    writeFileSync(join(tmp, "x.tsx"), "foo\n");
    const fetcher = (async () => ({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    const r = await feedbackMissed({
      cwd: tmp,
      missed: "x.tsx:1",
      autoConfirm: true,
      saltOverride: "s",
      remoteUrlOverride: "https://github.com/example/repo",
      fetcher,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("http-500");
  });

  it("returns bucket-unavailable when no remote URL or salt is reachable", async () => {
    writeFileSync(join(tmp, "x.tsx"), "foo\n");
    const r = await feedbackMissed({
      cwd: tmp,
      missed: "x.tsx:1",
      autoConfirm: true,
      // No saltOverride, no remoteUrlOverride — and tmp isn't a git repo so getRemoteOriginUrl returns null.
      // Skip the salt fetch by overriding to an unreachable URL — defensive.
      saltUrl: "http://127.0.0.1:1",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bucket-unavailable");
  });

  it("rejects empty source lines", async () => {
    writeFileSync(join(tmp, "x.tsx"), "\n\n\n");
    const r = await feedbackMissed({
      cwd: tmp,
      missed: "x.tsx:1",
      autoConfirm: true,
      saltOverride: "s",
      remoteUrlOverride: "https://github.com/example/repo",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty-line");
  });
});
