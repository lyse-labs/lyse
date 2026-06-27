import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuditPipelineResult } from "../../src/commands/audit-pipeline.js";
import type { TokenMap } from "../../src/types.js";
import type { AgentId } from "../../src/agent/registry.js";

vi.mock("../../src/commands/audit-pipeline.js", () => ({
  auditDirectory: vi.fn(),
  RefuseToRunError: class RefuseToRunError extends Error {},
}));

import { auditDirectory, RefuseToRunError } from "../../src/commands/audit-pipeline.js";
import { runHandoffCommand } from "../../src/commands/handoff.js";

const mockAuditDirectory = vi.mocked(auditDirectory);

const emptyTokenMap: TokenMap = {
  source: "css-vars",
  colors: new Map(),
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

function makeAuditResult(findingCount = 1, repoRoot = "/fake/root"): AuditPipelineResult {
  const findings = Array.from({ length: findingCount }, (_, i) => ({
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens" as const,
    severity: "warning" as const,
    location: { file: `src/File${i}.tsx`, line: 10, column: 1 },
    message: `Hardcoded color #fff at line ${i}`,
    suggestion: "use a token",
  }));
  return {
    result: {
      schemaVersion: 2 as const,
      rulesVersion: "1.0.0",
      toolVersion: "0.0.0",
      scoringVersion: "v2",
      repoRoot,
      timestamp: new Date().toISOString(),
      stack: [],
      finalScore: 72,
      tier: "C" as const,
      grade: "C",
      axes: [],
      findings,
      meta: { coverage: { scannedFiles: 1, durationMs: 1, configPath: null } },
    },
    tokens: emptyTokenMap,
    config: {} as never,
    componentInventory: [],
    fileCount: 1,
  };
}

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "lyse-cmd-handoff-"));
}

let stdoutOutput: string;
let originalWrite: typeof process.stdout.write;

beforeEach(() => {
  stdoutOutput = "";
  originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array, ..._rest: unknown[]) => {
    stdoutOutput += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  };
});

afterEach(() => {
  process.stdout.write = originalWrite;
  vi.clearAllMocks();
});

describe("runHandoffCommand — non-interactive guard", () => {
  it("prints the non-TTY message and returns without prompting when isInteractive=false", async () => {
    const promptSpy = vi.fn();
    const launchSpy = vi.fn();

    await runHandoffCommand("/fake/root", {
      isInteractive: () => false,
      prompt: promptSpy,
      launch: launchSpy,
    });

    expect(stdoutOutput).toContain("needs an interactive terminal");
    expect(promptSpy).not.toHaveBeenCalled();
    expect(launchSpy).not.toHaveBeenCalled();
    expect(mockAuditDirectory).not.toHaveBeenCalled();
  });

  it("does not run the audit pipeline when non-interactive", async () => {
    await runHandoffCommand("/fake/root", { isInteractive: () => false });
    expect(mockAuditDirectory).not.toHaveBeenCalled();
  });
});

describe("runHandoffCommand — interactive, action=skipped", () => {
  it("runs audit, calls prompt, prints 'skipped' when user skips", async () => {
    const root = makeTempRoot();
    mockAuditDirectory.mockResolvedValueOnce(makeAuditResult(2, root));

    const promptSpy = vi.fn().mockResolvedValue("skip");
    const launchSpy = vi.fn();

    await runHandoffCommand(root, {
      isInteractive: () => true,
      prompt: promptSpy,
      launch: launchSpy,
    });

    expect(mockAuditDirectory).toHaveBeenCalledWith(root);
    expect(promptSpy).toHaveBeenCalledOnce();
    expect(launchSpy).not.toHaveBeenCalled();
    expect(stdoutOutput).toContain("skipped");
  });

  it("prints 'No findings' and does not call prompt when audit returns 0 findings", async () => {
    const root = makeTempRoot();
    mockAuditDirectory.mockResolvedValueOnce(makeAuditResult(0, root));

    const promptSpy = vi.fn();
    const launchSpy = vi.fn();

    await runHandoffCommand(root, {
      isInteractive: () => true,
      prompt: promptSpy,
      launch: launchSpy,
    });

    expect(promptSpy).not.toHaveBeenCalled();
    expect(stdoutOutput).toContain("No findings");
  });
});

describe("runHandoffCommand — interactive, action=launched", () => {
  it("calls launch spy and prints agent id on launch", async () => {
    const root = makeTempRoot();
    mockAuditDirectory.mockResolvedValueOnce(makeAuditResult(1, root));

    const agentId: AgentId = "claude-code";
    const promptSpy = vi.fn().mockResolvedValue(agentId);
    const launchSpy = vi.fn().mockResolvedValue(0);

    const registryModule = await import("../../src/agent/registry.js");
    const isAvailableSpy = vi.spyOn(registryModule, "isCommandAvailable").mockResolvedValue(true);

    const skillModule = await import("../../src/agent/skill.js");
    const skillSpy = vi.spyOn(skillModule, "installLyseSkill").mockReturnValue({ path: "/fake", installed: true });

    try {
      await runHandoffCommand(root, {
        isInteractive: () => true,
        prompt: promptSpy,
        launch: launchSpy,
      });

      expect(launchSpy).toHaveBeenCalledOnce();
      const [calledAgentId] = launchSpy.mock.calls[0] as [AgentId, string, string];
      expect(calledAgentId).toBe(agentId);
      expect(stdoutOutput).toContain("Agent launched");
      expect(stdoutOutput).toContain(agentId);
    } finally {
      isAvailableSpy.mockRestore();
      skillSpy.mockRestore();
    }
  });
});

describe("runHandoffCommand — interactive, action=copied", () => {
  it("prints clipboard message when user picks 'copy'", async () => {
    const root = makeTempRoot();
    mockAuditDirectory.mockResolvedValueOnce(makeAuditResult(1, root));

    const promptSpy = vi.fn().mockResolvedValue("copy");
    const launchSpy = vi.fn();

    const launchModule = await import("../../src/agent/launch.js");
    const clipboardSpy = vi.spyOn(launchModule, "copyToClipboard").mockResolvedValue(true);

    try {
      await runHandoffCommand(root, {
        isInteractive: () => true,
        prompt: promptSpy,
        launch: launchSpy,
      });

      expect(launchSpy).not.toHaveBeenCalled();
      expect(stdoutOutput).toContain("clipboard");
    } finally {
      clipboardSpy.mockRestore();
    }
  });
});

describe("runHandoffCommand — RefuseToRunError", () => {
  it("prints the error message and does not prompt when auditDirectory throws RefuseToRunError", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      throw new Error("process.exit called");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    mockAuditDirectory.mockRejectedValueOnce(new RefuseToRunError("not a git repo"));

    const promptSpy = vi.fn();
    const launchSpy = vi.fn();

    try {
      await expect(
        runHandoffCommand("/fake/root", {
          isInteractive: () => true,
          prompt: promptSpy,
          launch: launchSpy,
        }),
      ).rejects.toThrow("process.exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith("[lyse] not a git repo");
      expect(promptSpy).not.toHaveBeenCalled();
      expect(launchSpy).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });
});
