import { readConsent, writeConsent, resetConsentCache, type ConsentDeps } from "../telemetry/consent.js";

function writeFinal(accepted: boolean, deps: ConsentDeps = {}): void {
  writeConsent({
    accepted,
    attempt: 2,
    decided_at: new Date().toISOString(),
    version: "1.0.0",
  }, deps);
  resetConsentCache();
}

export function runTelemetryOn(deps: ConsentDeps = {}): void {
  writeFinal(true, deps);
  console.log("Telemetry enabled. Anonymous bench events will be sent on future audits.");
}

export function runTelemetryOff(deps: ConsentDeps = {}): void {
  writeFinal(false, deps);
  console.log("Telemetry disabled. No data will be sent.");
}

export function runTelemetryStatus(deps: ConsentDeps = {}): void {
  const c = readConsent(deps);
  if (!c) {
    console.log("Telemetry status: not yet decided. You will be asked on your next `lyse audit`.");
    return;
  }
  console.log(`Telemetry status: ${c.accepted ? "enabled" : "disabled"} (decided ${c.decided_at}).`);
}
