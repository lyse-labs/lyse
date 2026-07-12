import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readLlmConsent,
  writeLlmConsent,
  llmConsentFilePath,
  ensureLlmConsentDecision,
  resolveLlmConsent,
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

describe("ensureLlmConsentDecision — env + non-TTY", () => {
  it("LYSE_LLM=1 with no record → accepted + persisted, no prompt", async () => {
    process.env["LYSE_LLM"] = "1";
    const d = await ensureLlmConsentDecision(deps());
    expect(d.accepted).toBe(true);
    expect(d.justAsked).toBe(false);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("LYSE_LLM=0 → off, never prompts, does NOT write a record", async () => {
    process.env["LYSE_LLM"] = "0";
    const d = await ensureLlmConsentDecision(deps());
    expect(d.accepted).toBe(false);
    expect(existsSync(llmConsentFilePath(deps()))).toBe(false);
  });
  it("LYSE_LLM=0 overrides a prior accepted record (runtime opt-out, no rewrite)", async () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    process.env["LYSE_LLM"] = "0";
    const granted = await resolveLlmConsent(undefined, deps());
    expect(granted).toBe(false);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("non-TTY with no record/env → off, no prompt", async () => {
    const d = await ensureLlmConsentDecision(deps());
    expect(d.accepted).toBe(false);
  });
  it("persisted accepted → returns accepted without prompting", async () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    const d = await ensureLlmConsentDecision(deps());
    expect(d).toEqual({ accepted: true, justAsked: false });
  });
});

describe("resolveLlmConsent — flag precedence", () => {
  it("--no-llm (flags.llm=false) → false, even with LYSE_LLM=1", async () => {
    process.env["LYSE_LLM"] = "1";
    expect(await resolveLlmConsent({ llm: false }, deps())).toBe(false);
  });
  it("--llm (flags.llm=true) → true without prompt", async () => {
    expect(await resolveLlmConsent({ llm: true }, deps())).toBe(true);
  });
  it("no flag → defers to ensureLlmConsentDecision (non-TTY → false)", async () => {
    expect(await resolveLlmConsent(undefined, deps())).toBe(false);
  });
});

describe("resolveLlmConsentNonInteractive — default audit path, never prompts", () => {
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
  it("--llm / --no-llm flags win over env and record", () => {
    process.env["LYSE_LLM"] = "1";
    expect(resolveLlmConsentNonInteractive({ llm: false }, deps())).toBe(false);
    delete process.env["LYSE_LLM"];
    expect(resolveLlmConsentNonInteractive({ llm: true }, deps())).toBe(true);
  });
  it("LYSE_LLM=1 with no record → accepted + persisted", () => {
    process.env["LYSE_LLM"] = "1";
    expect(resolveLlmConsentNonInteractive(undefined, deps())).toBe(true);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("LYSE_LLM=0 → false even with a prior accepted record (no rewrite)", () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    process.env["LYSE_LLM"] = "0";
    expect(resolveLlmConsentNonInteractive(undefined, deps())).toBe(false);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("persisted decision applies", () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    expect(resolveLlmConsentNonInteractive(undefined, deps())).toBe(true);
  });
});
