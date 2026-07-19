import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// `spawnAgentLauncher` shells out via `node:child_process`'s `spawn`. This
// suite verifies its argv construction (in particular: `--review` /
// `reviewMode` must omit the bypass flag) WITHOUT ever launching a real
// process — `spawn` is fully mocked below, isolated in its own file so this
// mock can't leak into other suites that rely on the real child_process
// module (e.g. `agent/registry.ts`'s `isCommandAvailable` probe).
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { spawnAgentLauncher } from "../../src/agent/handoff.js";

const spawnMock = vi.mocked(spawn);

function fakeChildProcess(): ChildProcess {
  const ee = new EventEmitter();
  queueMicrotask(() => ee.emit("close", 0));
  return ee as unknown as ChildProcess;
}

afterEach(() => {
  spawnMock.mockReset();
});

describe("spawnAgentLauncher — argv construction", () => {
  it("default (no opts): includes --dangerously-skip-permissions for claude-code", async () => {
    spawnMock.mockImplementation(() => fakeChildProcess());

    await spawnAgentLauncher("claude-code", "fix these issues", "/tmp/fake-cwd");

    expect(spawnMock).toHaveBeenCalledOnce();
    const [binary, argv] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(binary).toBe("claude");
    expect(argv).toContain("--dangerously-skip-permissions");
    expect(argv).toContain("fix these issues");
  });

  it("reviewMode: true — omits --dangerously-skip-permissions for claude-code", async () => {
    spawnMock.mockImplementation(() => fakeChildProcess());

    await spawnAgentLauncher("claude-code", "fix these issues", "/tmp/fake-cwd", { reviewMode: true });

    expect(spawnMock).toHaveBeenCalledOnce();
    const [binary, argv] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(binary).toBe("claude");
    expect(argv).not.toContain("--dangerously-skip-permissions");
    expect(argv).toContain("fix these issues");
  });

  it("reviewMode: true — omits --yolo for codex", async () => {
    spawnMock.mockImplementation(() => fakeChildProcess());

    await spawnAgentLauncher("codex", "fix these issues", "/tmp/fake-cwd", { reviewMode: true });

    const [, argv] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(argv).not.toContain("--yolo");
  });

  it("reviewMode: true — omits --force for cursor", async () => {
    spawnMock.mockImplementation(() => fakeChildProcess());

    await spawnAgentLauncher("cursor", "fix these issues", "/tmp/fake-cwd", { reviewMode: true });

    const [binary, argv] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(binary).toBe("cursor-agent");
    expect(argv).not.toContain("--force");
  });

  it("reviewMode: false is equivalent to omitting opts entirely", async () => {
    spawnMock.mockImplementation(() => fakeChildProcess());
    await spawnAgentLauncher("claude-code", "fix", "/tmp/x", { reviewMode: false });
    const [, argv] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(argv).toContain("--dangerously-skip-permissions");
  });

  it("never calls spawn for opencode (launchSupported: false) even with reviewMode: true", async () => {
    const result = await spawnAgentLauncher("opencode", "fix", "/tmp/x", { reviewMode: true });
    expect(result).toBe(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
