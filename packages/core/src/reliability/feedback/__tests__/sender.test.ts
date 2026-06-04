import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendFeedback } from "../sender.js";
import { __setCacheForTest, resetConsentCache } from "../../../telemetry/consent.js";

function enableConsent(): void {
  __setCacheForTest({ accepted: true, initialised: true });
}

describe("sendFeedback", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __setCacheForTest({ accepted: false, initialised: true });
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    resetConsentCache();
    vi.unstubAllGlobals();
  });

  it("does NOT fetch when consent is absent", async () => {
    const r = await sendFeedback({
      endpoint: "http://example.test/v1/feedback",
      finding: { ruleId: "x", subAxisId: "tokens.color" },
      verdict: "valid",
      remoteUrl: "https://github.com/foo/bar.git",
      salt: "s",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("does NOT fetch when consent.accepted=false", async () => {
    __setCacheForTest({ accepted: false, initialised: true });
    const r = await sendFeedback({
      endpoint: "http://example.test/v1/feedback",
      finding: { ruleId: "x", subAxisId: "tokens.color" },
      verdict: "valid",
      remoteUrl: "https://github.com/foo/bar.git",
      salt: "s",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("posts JSON payload with HMACed repoBucket when consent is accepted", async () => {
    enableConsent();
    await sendFeedback({
      endpoint: "http://example.test/v1/feedback",
      finding: { ruleId: "tokens/no-hardcoded-color", subAxisId: "tokens.color" },
      verdict: "valid",
      remoteUrl: "https://github.com/foo/bar.git",
      salt: "s-2026-05-22",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://example.test/v1/feedback");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.ruleId).toBe("tokens/no-hardcoded-color");
    expect(body.subAxisId).toBe("tokens.color");
    expect(body.verdict).toBe("valid");
    expect(body.signed).toBe(false);
    expect(body.repoBucket).toMatch(/^[0-9a-f]{16}$/);
  });

  it("payload contains ONLY the 5 allowed fields (no PII leak)", async () => {
    enableConsent();
    await sendFeedback({
      endpoint: "http://example.test/v1/feedback",
      finding: { ruleId: "r", subAxisId: "a.b" },
      verdict: "invalid",
      remoteUrl: "https://github.com/foo/secret-repo.git",
      salt: "s",
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(Object.keys(body).sort()).toEqual(["repoBucket", "ruleId", "signed", "subAxisId", "verdict"]);
    expect(JSON.stringify(body)).not.toContain("secret-repo");
    expect(JSON.stringify(body)).not.toContain("github.com");
  });

  it("returns ok=false on network failure (silent)", async () => {
    enableConsent();
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const r = await sendFeedback({
      endpoint: "http://invalid/v1/feedback",
      finding: { ruleId: "x", subAxisId: "tokens.color" },
      verdict: "valid",
      remoteUrl: "https://github.com/foo/bar.git",
      salt: "s",
    });
    expect(r.ok).toBe(false);
  });

  it("returns ok=false when server returns non-2xx", async () => {
    enableConsent();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const r = await sendFeedback({
      endpoint: "http://example.test/v1/feedback",
      finding: { ruleId: "x", subAxisId: "tokens.color" },
      verdict: "valid",
      remoteUrl: "https://github.com/foo/bar.git",
      salt: "s",
    });
    expect(r.ok).toBe(false);
  });
});
