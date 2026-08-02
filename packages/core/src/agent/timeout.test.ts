import { describe, it, expect } from "vitest";
import { DEFAULT_HANDOFF_TIMEOUT_MS, TIMEOUT_EXIT_CODE, resolveTimeoutMs, timeoutNotice } from "./timeout.js";

describe("resolveTimeoutMs", () => {
  it("defaults to 30 minutes when nothing is set", () => {
    expect(resolveTimeoutMs({})).toBe(DEFAULT_HANDOFF_TIMEOUT_MS);
    expect(DEFAULT_HANDOFF_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it("honours an explicit LYSE_HANDOFF_TIMEOUT_MS", () => {
    expect(resolveTimeoutMs({ LYSE_HANDOFF_TIMEOUT_MS: "5000" })).toBe(5000);
  });

  it("treats 0 as an explicit opt-out", () => {
    // An unattended loop wants a timeout; a human watching the terminal may not.
    expect(resolveTimeoutMs({ LYSE_HANDOFF_TIMEOUT_MS: "0" })).toBeNull();
  });

  it("falls back to the default on anything unparseable, never to no timeout", () => {
    // A typo must not silently remove the only thing bounding an unattended run.
    for (const bad of ["", "abc", "-1", "1.5", "  ", "1e3", "9007199254740993"]) {
      expect(resolveTimeoutMs({ LYSE_HANDOFF_TIMEOUT_MS: bad }), bad).toBe(DEFAULT_HANDOFF_TIMEOUT_MS);
    }
  });
});

describe("timeoutNotice", () => {
  it("says how long it waited and what it did, in the transcript", () => {
    const notice = timeoutNotice(1_800_000);
    expect(notice).toContain("30m");
    expect(notice).toContain("LYSE_HANDOFF_TIMEOUT_MS");
    expect(notice.endsWith("\n")).toBe(true);
  });

  it("renders sub-minute timeouts readably", () => {
    expect(timeoutNotice(5000)).toContain("5s");
  });
});

describe("TIMEOUT_EXIT_CODE", () => {
  it("is 124, the conventional timeout status", () => {
    // Same as GNU coreutils `timeout`, so a caller that shells out reads it
    // the way it already reads every other timeout.
    expect(TIMEOUT_EXIT_CODE).toBe(124);
  });
});
