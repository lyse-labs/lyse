import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prompts from "prompts";
import {
  readConsent,
  writeConsent,
  consentFilePath,
  promptForConsent,
  ensureConsentDecision,
  getCachedConsent,
  resetConsentCache,
  type ConsentRecord,
} from "../../src/telemetry/consent.js";

let tmpHome: string;
let deps: { homeDir: () => string };

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "lyse-consent-"));
  deps = { homeDir: () => tmpHome };
  resetConsentCache();
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  resetConsentCache();
});

describe("consent file I/O", () => {
  it("consentFilePath returns ~/.lyse/consent.json under the current HOME", () => {
    expect(consentFilePath(deps)).toBe(join(tmpHome, ".lyse", "consent.json"));
  });

  it("readConsent returns null when the file does not exist", () => {
    expect(readConsent(deps)).toBeNull();
  });

  it("readConsent returns null on corrupt JSON (graceful degradation)", () => {
    mkdirSync(join(tmpHome, ".lyse"), { recursive: true });
    writeFileSync(join(tmpHome, ".lyse", "consent.json"), "not valid json{");
    expect(readConsent(deps)).toBeNull();
  });

  it("readConsent returns null on JSON that fails schema validation", () => {
    mkdirSync(join(tmpHome, ".lyse"), { recursive: true });
    writeFileSync(join(tmpHome, ".lyse", "consent.json"), JSON.stringify({ wrong: "shape" }));
    expect(readConsent(deps)).toBeNull();
  });

  it("writeConsent creates the .lyse directory if missing and writes valid JSON", () => {
    const rec: ConsentRecord = {
      accepted: true,
      attempt: 1,
      decided_at: "2026-05-20T10:00:00Z",
      version: "1.0.0",
    };
    writeConsent(rec, deps);
    expect(existsSync(join(tmpHome, ".lyse", "consent.json"))).toBe(true);
    const parsed = JSON.parse(readFileSync(join(tmpHome, ".lyse", "consent.json"), "utf8"));
    expect(parsed).toEqual(rec);
  });

  it("readConsent round-trips what writeConsent wrote", () => {
    const rec: ConsentRecord = {
      accepted: false,
      attempt: 2,
      decided_at: "2026-05-20T10:00:00Z",
      version: "1.0.0",
    };
    writeConsent(rec, deps);
    expect(readConsent(deps)).toEqual(rec);
  });
});

describe("promptForConsent", () => {
  afterEach(() => {
    prompts.override({});
  });

  it("returns 'skip' immediately when stdout is not a TTY", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    try {
      const result = await promptForConsent();
      expect(result).toBe("skip");
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("returns 'yes' when user answers y (via prompts.override)", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      prompts.override({ accepted: true });
      const result = await promptForConsent();
      expect(result).toBe("yes");
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("returns 'no' when user answers n", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      prompts.override({ accepted: false });
      const result = await promptForConsent();
      expect(result).toBe("no");
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("returns 'skip' when the prompts library yields no answer (Ctrl+C/EOF)", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      (prompts as unknown as { inject: (values: unknown[]) => void }).inject([
        new Error("cancelled"),
      ]);
      const result = await promptForConsent();
      expect(result).toBe("skip");
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });
});

describe("ensureConsentDecision", () => {
  beforeEach(() => {
    resetConsentCache();
    prompts.override({});
  });

  it("no file + non-TTY: returns {accepted: false, justAsked: false} and writes nothing", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    try {
      const out = await ensureConsentDecision(deps);
      expect(out).toEqual({ accepted: false, justAsked: false });
      expect(readConsent(deps)).toBeNull();
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("no file + TTY + user says yes: writes attempt=1 accepted=true, returns justAsked=true", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      prompts.override({ accepted: true });
      const out = await ensureConsentDecision(deps);
      expect(out).toEqual({ accepted: true, justAsked: true });
      const stored = readConsent(deps);
      expect(stored?.accepted).toBe(true);
      expect(stored?.attempt).toBe(1);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("no file + TTY + user says no: writes attempt=1 accepted=false, returns justAsked=true", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      prompts.override({ accepted: false });
      const out = await ensureConsentDecision(deps);
      expect(out).toEqual({ accepted: false, justAsked: true });
      expect(readConsent(deps)?.accepted).toBe(false);
      expect(readConsent(deps)?.attempt).toBe(1);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("existing attempt=1 accepted=false + TTY: re-prompts, persists attempt=2", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      writeConsent({ accepted: false, attempt: 1, decided_at: "2026-01-01T00:00:00Z", version: "1.0.0" }, deps);
      resetConsentCache();
      prompts.override({ accepted: true });
      const out = await ensureConsentDecision(deps);
      expect(out).toEqual({ accepted: true, justAsked: true });
      const stored = readConsent(deps);
      expect(stored?.accepted).toBe(true);
      expect(stored?.attempt).toBe(2);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("existing attempt=2: never re-prompts, returns stored value with justAsked=false", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      writeConsent({ accepted: false, attempt: 2, decided_at: "2026-01-01T00:00:00Z", version: "1.0.0" }, deps);
      resetConsentCache();
      prompts.override({ accepted: true });
      const out = await ensureConsentDecision(deps);
      expect(out).toEqual({ accepted: false, justAsked: false });
      expect(readConsent(deps)?.attempt).toBe(2);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("existing attempt=1 accepted=true: never re-prompts (yes is final immediately)", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      writeConsent({ accepted: true, attempt: 1, decided_at: "2026-01-01T00:00:00Z", version: "1.0.0" }, deps);
      resetConsentCache();
      prompts.override({ accepted: false });
      const out = await ensureConsentDecision(deps);
      expect(out).toEqual({ accepted: true, justAsked: false });
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("getCachedConsent returns false until ensureConsentDecision runs; tracks the stored state after", async () => {
    const origIsTTY = process.stdout.isTTY;
    expect(getCachedConsent(deps)).toBe(false);
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      prompts.override({ accepted: true });
      await ensureConsentDecision(deps);
      expect(getCachedConsent(deps)).toBe(true);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("migrates LYSE_TELEMETRY=1 from env into a consent file on first run", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    process.env["LYSE_TELEMETRY"] = "1";
    try {
      resetConsentCache();
      const decision = await ensureConsentDecision(deps);
      expect(decision).toEqual({ accepted: true, justAsked: false });
      const persisted = readConsent(deps);
      expect(persisted?.accepted).toBe(true);
      expect(persisted?.attempt).toBe(1);
    } finally {
      delete process.env["LYSE_TELEMETRY"];
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("non-TTY + skip outcome: persists attempt=1 accepted=false (Ctrl+C/EOF treated as 'n')", async () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      (prompts as unknown as { inject: (values: unknown[]) => void }).inject([
        new Error("cancelled"),
      ]);
      const out = await ensureConsentDecision(deps);
      expect(out).toEqual({ accepted: false, justAsked: true });
      expect(readConsent(deps)?.accepted).toBe(false);
      expect(readConsent(deps)?.attempt).toBe(1);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });
});
