import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTelemetryOn, runTelemetryOff, runTelemetryStatus } from "../../src/commands/telemetry.js";
import { readConsent, resetConsentCache, __setCacheForTest } from "../../src/telemetry/consent.js";

let tmpHome: string;
let deps: { homeDir: () => string };

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "lyse-tel-cmd-"));
  deps = { homeDir: () => tmpHome };
  resetConsentCache();
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  resetConsentCache();
});

describe("lyse telemetry on", () => {
  it("writes consent.accepted=true with attempt=2 (treated as final)", () => {
    runTelemetryOn(deps);
    const stored = readConsent(deps);
    expect(stored?.accepted).toBe(true);
    expect(stored?.attempt).toBe(2);
  });
});

describe("lyse telemetry off", () => {
  it("writes consent.accepted=false with attempt=2", () => {
    runTelemetryOff(deps);
    const stored = readConsent(deps);
    expect(stored?.accepted).toBe(false);
    expect(stored?.attempt).toBe(2);
  });

  it("overrides a previous yes", () => {
    runTelemetryOn(deps);
    runTelemetryOff(deps);
    expect(readConsent(deps)?.accepted).toBe(false);
  });
});

describe("lyse telemetry status", () => {
  it("prints 'not yet decided' when no consent file", () => {
    __setCacheForTest({ accepted: false, initialised: false });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    runTelemetryStatus(deps);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not yet decided"));
    log.mockRestore();
  });

  it("prints 'enabled' after telemetry on", () => {
    runTelemetryOn(deps);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    runTelemetryStatus(deps);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("enabled"));
    log.mockRestore();
  });

  it("prints 'disabled' after telemetry off", () => {
    runTelemetryOff(deps);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    runTelemetryStatus(deps);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("disabled"));
    log.mockRestore();
  });
});
