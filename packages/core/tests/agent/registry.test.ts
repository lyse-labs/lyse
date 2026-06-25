import { describe, it, expect, vi } from "vitest";
import { AGENTS, detectAgents, isCommandAvailable } from "../../src/agent/registry.js";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("agent registry", () => {
  it("lists the four supported agents with stable ids", () => {
    expect(AGENTS.map((a) => a.id).sort()).toEqual(["claude-code", "codex", "cursor", "opencode"]);
    for (const a of AGENTS) {
      expect(a.binary).toBeTruthy();
      expect(a.skillRelPath).toBeTruthy();
    }
  });

  it("isCommandAvailable resolves false for a nonsense binary", async () => {
    await expect(isCommandAvailable("definitely-not-a-real-binary-xyz")).resolves.toBe(false);
  });

  it("isCommandAvailable rejects shell-injection tokens (never spawns a shell)", async () => {
    await expect(isCommandAvailable("; rm -rf /")).resolves.toBe(false);
    await expect(isCommandAvailable("a && b")).resolves.toBe(false);
    await expect(isCommandAvailable("$(touch /tmp/x)")).resolves.toBe(false);
  });

  it("detectAgents picks up an agent by repo-local config dir", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-agents-"));
    mkdirSync(join(root, ".cursor"), { recursive: true });
    const detected = await detectAgents(root);
    expect(detected.map((a) => a.id)).toContain("cursor");
  });

  it("detectAgents detects via configDir only, with isCommandAvailable stubbed false", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-agents-configdir-"));
    mkdirSync(join(root, ".cursor"), { recursive: true });

    const registryModule = await import("../../src/agent/registry.js");
    const spy = vi.spyOn(registryModule, "isCommandAvailable").mockResolvedValue(false);

    try {
      const detected = await detectAgents(root);
      expect(detected.map((a) => a.id)).toContain("cursor");
    } finally {
      spy.mockRestore();
    }
  });

  it("detectAgents excludes agents when no configDir exists and binary unavailable", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-agents-empty-"));

    const registryModule = await import("../../src/agent/registry.js");
    const spy = vi.spyOn(registryModule, "isCommandAvailable").mockResolvedValue(false);

    try {
      const detected = await detectAgents(root);
      expect(detected.map((a) => a.id)).not.toContain("cursor");
    } finally {
      spy.mockRestore();
    }
  });
});
