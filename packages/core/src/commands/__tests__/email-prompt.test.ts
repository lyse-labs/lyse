import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDeclinedProfile,
  buildProfile,
  hasProfileDecision,
  isValidEmail,
  persistProfile,
  postEmailToWorker,
  profilePath,
  readProfile,
  shouldPromptForEmail,
  syncPendingEmail,
  workerEmailEndpoint,
} from "../email-prompt.js";

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "lyse-email-prompt-"));
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("thomas@getlyse.com")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("workerEmailEndpoint", () => {
  it("defaults to api.getlyse.com", () => {
    expect(workerEmailEndpoint({})).toBe("https://api.getlyse.com/v1/profile/email");
  });
  it("respects LYSE_EMAIL_ENDPOINT override", () => {
    expect(workerEmailEndpoint({ LYSE_EMAIL_ENDPOINT: "http://x" })).toBe("http://x");
  });
});

describe("shouldPromptForEmail", () => {
  it("returns false on --yes / CI / non-TTY / LYSE_NO_EMAIL_PROMPT=1", () => {
    expect(shouldPromptForEmail({ yes: true }, {}, true, tmpHome)).toBe(false);
    expect(shouldPromptForEmail({}, { LYSE_NO_EMAIL_PROMPT: "1" }, true, tmpHome)).toBe(false);
    expect(shouldPromptForEmail({}, { CI: "true" }, true, tmpHome)).toBe(false);
    expect(shouldPromptForEmail({}, {}, false, tmpHome)).toBe(false);
  });
  it("returns true on a fresh interactive machine", () => {
    expect(shouldPromptForEmail({}, {}, true, tmpHome)).toBe(true);
  });
  it("returns false once a profile decision is on disk", () => {
    mkdirSync(join(tmpHome, ".lyse"), { recursive: true });
    writeFileSync(profilePath(tmpHome), JSON.stringify({ email: "x@y.z", createdAt: "now", lyseVersion: "0" }));
    expect(shouldPromptForEmail({}, {}, true, tmpHome)).toBe(false);
  });
});

describe("readProfile", () => {
  it("returns null when no profile exists", () => {
    expect(readProfile(tmpHome)).toBeNull();
  });
  it("parses an email profile", () => {
    mkdirSync(join(tmpHome, ".lyse"), { recursive: true });
    writeFileSync(profilePath(tmpHome), JSON.stringify({ email: "a@b.co", createdAt: "2026-01-01T00:00:00Z", lyseVersion: "0.1.0" }));
    expect(readProfile(tmpHome)).toMatchObject({ email: "a@b.co" });
  });
  it("parses a declined profile", () => {
    mkdirSync(join(tmpHome, ".lyse"), { recursive: true });
    writeFileSync(profilePath(tmpHome), JSON.stringify({ declined: true, declinedAt: "now", lyseVersion: "0.1.0" }));
    expect(readProfile(tmpHome)).toMatchObject({ declined: true });
  });
  it("returns null for malformed JSON", () => {
    mkdirSync(join(tmpHome, ".lyse"), { recursive: true });
    writeFileSync(profilePath(tmpHome), "not json");
    expect(readProfile(tmpHome)).toBeNull();
  });
});

describe("persistProfile", () => {
  it("writes ~/.lyse/profile.json", async () => {
    const path = await persistProfile(buildProfile("a@b.co"), tmpHome);
    expect(path).toBe(profilePath(tmpHome));
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ email: "a@b.co" });
  });
  it("declined marker suppresses future prompts", async () => {
    await persistProfile(buildDeclinedProfile(), tmpHome);
    expect(hasProfileDecision(tmpHome)).toBe(true);
    expect(shouldPromptForEmail({}, {}, true, tmpHome)).toBe(false);
  });
});

describe("postEmailToWorker", () => {
  it("POSTs and returns true on 2xx", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const ok = await postEmailToWorker("a@b.co", { endpoint: "http://x", timeoutMs: 500 });
    expect(ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://x");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.email).toBe("a@b.co");
    expect(typeof body.capturedAt).toBe("string");
    expect(typeof body.lyseVersion).toBe("string");
  });
  it("returns false on non-2xx and network error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    expect(await postEmailToWorker("a@b.co", { endpoint: "http://x", timeoutMs: 500 })).toBe(false);
  });
  it("skips when LYSE_NO_EMAIL_POST=1", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await postEmailToWorker("a@b.co", { env: { LYSE_NO_EMAIL_POST: "1" } })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("syncPendingEmail", () => {
  it("is a no-op when nothing pending", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await syncPendingEmail(tmpHome)).toBe("skipped");
    await persistProfile(buildDeclinedProfile(), tmpHome);
    expect(await syncPendingEmail(tmpHome)).toBe("skipped");
    await persistProfile({ ...buildProfile("a@b.co"), sentAt: "2026-01-01T00:00:00Z" }, tmpHome);
    expect(await syncPendingEmail(tmpHome)).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("POSTs pending email and stamps sentAt on success", async () => {
    await persistProfile(buildProfile("a@b.co"), tmpHome);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    expect(await syncPendingEmail(tmpHome)).toBe("sent");
    expect((readProfile(tmpHome) as { sentAt?: string }).sentAt).toBeTypeOf("string");
  });
  it("returns failed and keeps email for next retry on failure", async () => {
    await persistProfile(buildProfile("a@b.co"), tmpHome);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await syncPendingEmail(tmpHome)).toBe("failed");
    expect((readProfile(tmpHome) as { sentAt?: string }).sentAt).toBeUndefined();
  });
});
