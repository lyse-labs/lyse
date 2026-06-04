import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchBucketSalt,
  getFeedbackEndpoint,
  getSaltUrl,
  getSubAxisForRule,
  runInteractiveFeedback,
} from "../interactive.js";

describe("getSubAxisForRule", () => {
  it("maps known rule IDs to seeded sub-axes", () => {
    expect(getSubAxisForRule("tokens/no-hardcoded-color")).toBe("tokens.color");
    expect(getSubAxisForRule("tokens/no-hardcoded-spacing")).toBe("tokens.spacing");
    expect(getSubAxisForRule("a11y/essentials")).toBe("a11y.essentials");
    expect(getSubAxisForRule("components/no-native-shadows")).toBe("components.native-shadows");
  });

  it("returns 'unmapped' for unknown rule IDs", () => {
    expect(getSubAxisForRule("definitely/not-a-rule")).toBe("unmapped");
  });
});

describe("endpoint / salt URL env overrides", () => {
  const origEndpoint = process.env["LYSE_FEEDBACK_ENDPOINT"];
  const origSalt = process.env["LYSE_FEEDBACK_SALT_URL"];

  afterEach(() => {
    if (origEndpoint === undefined) delete process.env["LYSE_FEEDBACK_ENDPOINT"];
    else process.env["LYSE_FEEDBACK_ENDPOINT"] = origEndpoint;
    if (origSalt === undefined) delete process.env["LYSE_FEEDBACK_SALT_URL"];
    else process.env["LYSE_FEEDBACK_SALT_URL"] = origSalt;
  });

  it("returns production endpoint by default", () => {
    delete process.env["LYSE_FEEDBACK_ENDPOINT"];
    expect(getFeedbackEndpoint()).toBe("https://api.getlyse.com/v1/feedback");
  });

  it("honors LYSE_FEEDBACK_ENDPOINT override", () => {
    process.env["LYSE_FEEDBACK_ENDPOINT"] = "http://staging.test/v1/feedback";
    expect(getFeedbackEndpoint()).toBe("http://staging.test/v1/feedback");
  });

  it("returns production salt URL by default", () => {
    delete process.env["LYSE_FEEDBACK_SALT_URL"];
    expect(getSaltUrl()).toBe("https://api.getlyse.com/v1/bucket-salt");
  });

  it("honors LYSE_FEEDBACK_SALT_URL override", () => {
    process.env["LYSE_FEEDBACK_SALT_URL"] = "http://staging.test/v1/bucket-salt";
    expect(getSaltUrl()).toBe("http://staging.test/v1/bucket-salt");
  });
});

describe("fetchBucketSalt", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns raw string body when not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("salt-2026-05-22"));
    const s = await fetchBucketSalt("http://test/salt");
    expect(s).toBe("salt-2026-05-22");
  });

  it("extracts .salt from JSON body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ salt: "abc-123" })));
    const s = await fetchBucketSalt("http://test/salt");
    expect(s).toBe("abc-123");
  });

  it("returns null on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const s = await fetchBucketSalt("http://test/salt");
    expect(s).toBeNull();
  });

  it("returns null on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ENETDOWN"));
    const s = await fetchBucketSalt("http://test/salt");
    expect(s).toBeNull();
  });

  it("returns null on empty body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(""));
    const s = await fetchBucketSalt("http://test/salt");
    expect(s).toBeNull();
  });
});

describe("runInteractiveFeedback (empty short-circuit)", () => {
  it("returns immediately when there are no findings", async () => {
    const r = await runInteractiveFeedback({ findings: [], repoRoot: process.cwd() });
    expect(r).toEqual({ sent: 0, skipped: 0, aborted: false });
  });
});
