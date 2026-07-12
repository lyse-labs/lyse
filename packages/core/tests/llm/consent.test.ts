import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readLlmConsent,
  writeLlmConsent,
  llmConsentFilePath,
  resolveLlmConsentNonInteractive,
} from "../../src/llm/consent.js";

let home: string;
const deps = () => ({ homeDir: () => home });
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "lyse-llm-consent-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env["LYSE_LLM"];
});

describe("llm consent — persistence", () => {
  it("round-trips a record at ~/.lyse/llm-consent.json", () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    expect(llmConsentFilePath(deps()).endsWith(join(".lyse", "llm-consent.json"))).toBe(true);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("returns null when absent", () => {
    expect(readLlmConsent(deps())).toBeNull();
  });
});

describe("resolveLlmConsentNonInteractive — the only production path, never prompts", () => {
  it("undecided + TTY: returns false, writes nothing, never prompts", () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      expect(resolveLlmConsentNonInteractive(undefined, deps())).toBe(false);
      expect(existsSync(llmConsentFilePath(deps()))).toBe(false);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });
  it("--no-llm (flags.llm=false) → false, even with LYSE_LLM=1", () => {
    process.env["LYSE_LLM"] = "1";
    expect(resolveLlmConsentNonInteractive({ llm: false }, deps())).toBe(false);
  });
  it("--llm (flags.llm=true) → true, even with LYSE_LLM=0", () => {
    process.env["LYSE_LLM"] = "0";
    expect(resolveLlmConsentNonInteractive({ llm: true }, deps())).toBe(true);
  });
  it("LYSE_LLM=1 with no record → accepted + persisted", () => {
    process.env["LYSE_LLM"] = "1";
    expect(resolveLlmConsentNonInteractive(undefined, deps())).toBe(true);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("LYSE_LLM=0 → false even with a prior accepted record (runtime opt-out, no rewrite)", () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    process.env["LYSE_LLM"] = "0";
    expect(resolveLlmConsentNonInteractive(undefined, deps())).toBe(false);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("a persisted decision (e.g. from a past interactive prompt) stays honored", () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    expect(resolveLlmConsentNonInteractive(undefined, deps())).toBe(true);
  });
  it("a persisted decline stays declined", () => {
    writeLlmConsent({ accepted: false, attempt: 2, decided_at: "t", version: "1.0.0" }, deps());
    expect(resolveLlmConsentNonInteractive(undefined, deps())).toBe(false);
  });
});
