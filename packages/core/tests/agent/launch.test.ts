import { describe, it, expect } from "vitest";
import { launchArgs, copyToClipboard } from "../../src/agent/launch.js";

describe("launchArgs", () => {
  it("claude-code → claude with dangerously-skip-permissions, launchSupported true", () => {
    expect(launchArgs("claude-code")).toEqual({
      binary: "claude",
      bypassFlags: ["--dangerously-skip-permissions"],
      launchSupported: true,
    });
  });

  it("codex → codex with --yolo, launchSupported true", () => {
    expect(launchArgs("codex")).toEqual({
      binary: "codex",
      bypassFlags: ["--yolo"],
      launchSupported: true,
    });
  });

  it("cursor → cursor-agent with --force, launchSupported true", () => {
    expect(launchArgs("cursor")).toEqual({
      binary: "cursor-agent",
      bypassFlags: ["--force"],
      launchSupported: true,
    });
  });

  it("opencode → opencode with empty bypassFlags, launchSupported false", () => {
    expect(launchArgs("opencode")).toEqual({
      binary: "opencode",
      bypassFlags: [],
      launchSupported: false,
    });
  });
});


describe("copyToClipboard", () => {
  it("returns a boolean and never throws when no clipboard binary is present", async () => {
    const result = await copyToClipboard("test payload");
    expect(typeof result).toBe("boolean");
  });

  it("handles empty string without throwing", async () => {
    const result = await copyToClipboard("");
    expect(typeof result).toBe("boolean");
  });
});
