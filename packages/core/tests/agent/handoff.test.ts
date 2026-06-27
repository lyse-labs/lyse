import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Finding, TokenMap } from "../../src/types.js";
import type { AgentId } from "../../src/agent/registry.js";
import type { HandoffDeps } from "../../src/agent/handoff.js";
import { runHandoff, spawnAgentLauncher } from "../../src/agent/handoff.js";

const baseFindings: Finding[] = [
  {
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens",
    severity: "warning",
    location: { file: "src/Button.tsx", line: 14, column: 1 },
    message: "Hardcoded color #3B82F6",
    suggestion: "consider replacing with token color.action.primary",
  },
];

const baseTokenMap: TokenMap = {
  source: "css-vars",
  colors: new Map([["#3b82f6", ["color.action.primary"]]]),
  spacing: new Map(),
  typography: new Map(),
  radii: new Map(),
  shadows: new Map(),
  motion: new Map(),
  breakpoints: new Map(),
  zIndex: new Map(),
  opacity: new Map(),
  borderWidth: new Map(),
};

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "lyse-handoff-"));
}

function makeDeps(overrides?: Partial<HandoffDeps>): HandoffDeps {
  return {
    prompt: vi.fn().mockResolvedValue(null),
    launch: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("runHandoff — empty findings", () => {
  it("returns { action: 'none' } immediately when findings is empty", async () => {
    const root = makeTempRoot();
    const deps = makeDeps();
    const result = await runHandoff(
      { findings: [], tokens: null, root, projectName: "acme" },
      deps,
    );
    expect(result).toEqual({ action: "none" });
    expect(deps.prompt).not.toHaveBeenCalled();
    expect(deps.launch).not.toHaveBeenCalled();
  });
});

describe("runHandoff — artifacts written", () => {
  it("writes findings.json and tokens.json under .lyse/handoff/", async () => {
    const root = makeTempRoot();
    const deps = makeDeps({ prompt: vi.fn().mockResolvedValue(null) });

    await runHandoff(
      { findings: baseFindings, tokens: baseTokenMap, root, projectName: "acme" },
      deps,
    );

    const findingsPath = join(root, ".lyse", "handoff", "findings.json");
    const tokensPath = join(root, ".lyse", "handoff", "tokens.json");
    expect(existsSync(findingsPath)).toBe(true);
    expect(existsSync(tokensPath)).toBe(true);

    const findings = JSON.parse(readFileSync(findingsPath, "utf8")) as unknown[];
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBe(1);

    const tokens = JSON.parse(readFileSync(tokensPath, "utf8")) as Record<string, unknown>;
    expect(tokens).toHaveProperty("source", "css-vars");
    expect(tokens).toHaveProperty("colors");
  });

  it("writes tokens.json as empty object when tokens is null", async () => {
    const root = makeTempRoot();
    const deps = makeDeps({ prompt: vi.fn().mockResolvedValue(null) });

    await runHandoff(
      { findings: baseFindings, tokens: null, root, projectName: "acme" },
      deps,
    );

    const tokensPath = join(root, ".lyse", "handoff", "tokens.json");
    const tokens = JSON.parse(readFileSync(tokensPath, "utf8")) as Record<string, unknown>;
    expect(tokens).toEqual({});
  });
});

describe("runHandoff — cancel/skip", () => {
  it("returns { action: 'skipped' } when prompt returns null", async () => {
    const root = makeTempRoot();
    const deps = makeDeps({ prompt: vi.fn().mockResolvedValue(null) });

    const result = await runHandoff(
      { findings: baseFindings, tokens: null, root, projectName: "acme" },
      deps,
    );

    expect(result).toEqual({ action: "skipped" });
    expect(deps.launch).not.toHaveBeenCalled();
  });

  it("returns { action: 'skipped' } when prompt returns 'skip'", async () => {
    const root = makeTempRoot();
    const deps = makeDeps({ prompt: vi.fn().mockResolvedValue("skip") });

    const result = await runHandoff(
      { findings: baseFindings, tokens: null, root, projectName: "acme" },
      deps,
    );

    expect(result).toEqual({ action: "skipped" });
    expect(deps.launch).not.toHaveBeenCalled();
  });
});

describe("runHandoff — copy to clipboard", () => {
  it("returns { action: 'copied' } when prompt returns 'copy'", async () => {
    const root = makeTempRoot();

    let capturedPayload = "";
    const launchModule = await import("../../src/agent/launch.js");
    const clipboardSpy = vi.spyOn(launchModule, "copyToClipboard").mockImplementation(async (text: string) => {
      capturedPayload = text;
      return true;
    });

    try {
      const deps = makeDeps({ prompt: vi.fn().mockResolvedValue("copy") });
      const result = await runHandoff(
        { findings: baseFindings, tokens: null, root, projectName: "acme" },
        deps,
      );

      expect(result).toEqual({ action: "copied" });
      expect(clipboardSpy).toHaveBeenCalledOnce();
      expect(capturedPayload).toContain("acme");
    } finally {
      clipboardSpy.mockRestore();
    }
  });

  it("returns { action: 'copy-failed' } when the clipboard copy fails", async () => {
    const root = makeTempRoot();

    const launchModule = await import("../../src/agent/launch.js");
    const clipboardSpy = vi
      .spyOn(launchModule, "copyToClipboard")
      .mockImplementation(async () => false);

    try {
      const deps = makeDeps({ prompt: vi.fn().mockResolvedValue("copy") });
      const result = await runHandoff(
        { findings: baseFindings, tokens: null, root, projectName: "acme" },
        deps,
      );

      expect(result).toEqual({ action: "copy-failed" });
    } finally {
      clipboardSpy.mockRestore();
    }
  });
});

describe("spawnAgentLauncher — unsupported agent guard", () => {
  it("returns 1 immediately for opencode (launchSupported: false)", async () => {
    const result = await spawnAgentLauncher("opencode", "fix these issues", "/tmp/fake-cwd");
    expect(result).toBe(1);
  });
});

describe("runHandoff — agent launch", () => {
  it("installs skill, persists target, calls launch, returns { action: 'launched', agentId }", async () => {
    const root = makeTempRoot();
    mkdirSync(join(root, ".cursor"), { recursive: true });

    const fakeHome = mkdtempSync(join(tmpdir(), "lyse-home-"));

    const registryModule = await import("../../src/agent/registry.js");
    const isAvailableSpy = vi.spyOn(registryModule, "isCommandAvailable").mockImplementation(async (bin: string) => {
      return bin === "cursor-agent";
    });

    const skillModule = await import("../../src/agent/skill.js");
    const skillSpy = vi.spyOn(skillModule, "installLyseSkill").mockReturnValue({ path: "/fake/path", installed: true });

    let launchCalledWith: { agentId: AgentId; prompt: string; cwd: string } | undefined;
    const launch = vi.fn().mockImplementation(async (agentId: AgentId, prompt: string, cwd: string) => {
      launchCalledWith = { agentId, prompt, cwd };
      return 0;
    });

    try {
      const deps = makeDeps({
        prompt: vi.fn().mockResolvedValue("cursor"),
        launch,
        targetFilePath: join(fakeHome, ".lyse", "handoff-target.json"),
      });

      const result = await runHandoff(
        { findings: baseFindings, tokens: null, root, projectName: "acme" },
        deps,
      );

      expect(result).toEqual({ action: "launched", agentId: "cursor" });
      expect(skillSpy).toHaveBeenCalledOnce();
      expect(launch).toHaveBeenCalledOnce();
      expect(launchCalledWith?.agentId).toBe("cursor");
      expect(launchCalledWith?.prompt).toContain("acme");
      expect(launchCalledWith?.cwd).toBe(root);

      const targetPath = join(fakeHome, ".lyse", "handoff-target.json");
      expect(existsSync(targetPath)).toBe(true);
      const persisted = JSON.parse(readFileSync(targetPath, "utf8")) as { agentId: string };
      expect(persisted.agentId).toBe("cursor");
    } finally {
      isAvailableSpy.mockRestore();
      skillSpy.mockRestore();
    }
  });

  it("menu only includes agents whose LAUNCH binary is available", async () => {
    const root = makeTempRoot();
    mkdirSync(join(root, ".cursor"), { recursive: true });

    const registryModule = await import("../../src/agent/registry.js");
    const isAvailableSpy = vi.spyOn(registryModule, "isCommandAvailable").mockResolvedValue(false);

    const capturedChoices: { value: string; label: string }[] = [];
    const deps = makeDeps({
      prompt: vi.fn().mockImplementation(async (choices: { value: string; label: string }[]) => {
        capturedChoices.push(...choices);
        return null;
      }),
    });

    try {
      await runHandoff(
        { findings: baseFindings, tokens: null, root, projectName: "acme" },
        deps,
      );

      const agentIds = capturedChoices.map((c) => c.value).filter((v) => v !== "copy" && v !== "skip");
      expect(agentIds).not.toContain("cursor");
      expect(capturedChoices.some((c) => c.value === "copy")).toBe(true);
      expect(capturedChoices.some((c) => c.value === "skip")).toBe(true);
    } finally {
      isAvailableSpy.mockRestore();
    }
  });

  it("always includes 'Copy prompt to clipboard' and 'Skip' options", async () => {
    const root = makeTempRoot();
    const capturedChoices: { value: string; label: string }[] = [];

    const registryModule = await import("../../src/agent/registry.js");
    const isAvailableSpy = vi.spyOn(registryModule, "isCommandAvailable").mockResolvedValue(false);

    try {
      const deps = makeDeps({
        prompt: vi.fn().mockImplementation(async (choices: { value: string; label: string }[]) => {
          capturedChoices.push(...choices);
          return null;
        }),
      });

      await runHandoff(
        { findings: baseFindings, tokens: null, root, projectName: "acme" },
        deps,
      );

      expect(capturedChoices.some((c) => c.value === "copy")).toBe(true);
      expect(capturedChoices.some((c) => c.value === "skip")).toBe(true);
    } finally {
      isAvailableSpy.mockRestore();
    }
  });
});
