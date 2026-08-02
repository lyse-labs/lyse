import { describe, it, expect } from "vitest";
import { snapshotAction, missingSnapshotMessage } from "./snapshot-policy.js";

describe("snapshotAction — a missing snapshot is not a pass", () => {
  it("compares when the snapshot exists and no update was requested", () => {
    expect(snapshotAction({ exists: true, update: false })).toBe("compare");
  });

  it("fails when the snapshot is missing", () => {
    // The self-healing oracle: the old code wrote the snapshot and then
    // asserted the output equalled what it had just written. Deleting a
    // snapshot turned that repository's check into `x === x`.
    expect(snapshotAction({ exists: false, update: false })).toBe("fail");
  });

  it("writes only when a human explicitly asked (UPDATE_GOLDEN=1)", () => {
    expect(snapshotAction({ exists: false, update: true })).toBe("write");
    expect(snapshotAction({ exists: true, update: true })).toBe("write");
  });

  it("never silently substitutes a write for a comparison", () => {
    expect(snapshotAction({ exists: false, update: false })).not.toBe("write");
  });

  it("tells the reader how to regenerate", () => {
    const msg = missingSnapshotMessage("carbon-react");
    expect(msg).toContain("carbon-react");
    expect(msg).toContain("UPDATE_GOLDEN=1");
  });
});
