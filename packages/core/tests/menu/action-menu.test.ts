import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { showActionMenu, type MenuContext } from "../../src/menu/action-menu.js";
import { isInteractive } from "../../src/menu/prompts.js";

const baseCtx: MenuContext = {
  autoFixableCount: 0,
  detectedIDE: false,
  detectedGitHub: false,
};

describe("menu/prompts: isInteractive", () => {
  let originalCI: string | undefined;
  let originalLysePrompt: string | undefined;
  let originalLyseYes: string | undefined;
  beforeEach(() => {
    originalCI = process.env.CI;
    originalLysePrompt = process.env.LYSE_NO_PROMPT;
    originalLyseYes = process.env.LYSE_YES;
    delete process.env.CI;
    delete process.env.LYSE_NO_PROMPT;
    delete process.env.LYSE_YES;
  });
  afterEach(() => {
    if (originalCI !== undefined) process.env.CI = originalCI; else delete process.env.CI;
    if (originalLysePrompt !== undefined) process.env.LYSE_NO_PROMPT = originalLysePrompt; else delete process.env.LYSE_NO_PROMPT;
    if (originalLyseYes !== undefined) process.env.LYSE_YES = originalLyseYes; else delete process.env.LYSE_YES;
  });

  it("returns false when CI=true", () => {
    process.env.CI = "true";
    expect(isInteractive()).toBe(false);
  });

  it("returns false when LYSE_NO_PROMPT=1", () => {
    process.env.LYSE_NO_PROMPT = "1";
    expect(isInteractive()).toBe(false);
  });

  it("returns false when LYSE_YES=1", () => {
    process.env.LYSE_YES = "1";
    expect(isInteractive()).toBe(false);
  });

  it("returns false when not a TTY (test environment)", () => {
    // tests run without TTY typically
    expect(isInteractive()).toBe(false);
  });
});

describe("showActionMenu (non-interactive)", () => {
  beforeEach(() => { process.env.LYSE_NO_PROMPT = "1"; });
  afterEach(() => { delete process.env.LYSE_NO_PROMPT; });

  it("returns 'exit' when no autoFixable + no detections", async () => {
    expect(await showActionMenu(baseCtx)).toBe("exit");
  });

  it("returns 'exit' in non-interactive mode (even when autoFixable > 0)", async () => {
    expect(await showActionMenu({ ...baseCtx, autoFixableCount: 5 })).toBe("exit");
  });
});

describe("showActionMenu — LYSE_NO_PROMPT guard (regression: menu must not stall audit)", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.LYSE_NO_PROMPT; process.env.LYSE_NO_PROMPT = "1"; });
  afterEach(() => { if (saved !== undefined) process.env.LYSE_NO_PROMPT = saved; else delete process.env.LYSE_NO_PROMPT; });

  it("resolves immediately to 'exit' — does not wait for TTY input", async () => {
    // This test would time-out if the menu tried to read from stdin.
    const start = Date.now();
    const result = await showActionMenu({ autoFixableCount: 3, detectedIDE: true, detectedGitHub: true });
    expect(Date.now() - start).toBeLessThan(500); // sanity: finishes fast
    expect(result).toBe("exit");
  });

  it("handles all menu-context combinations without throwing", async () => {
    const combos: MenuContext[] = [
      { autoFixableCount: 0, detectedIDE: false, detectedGitHub: false },
      { autoFixableCount: 10, detectedIDE: false, detectedGitHub: false },
      { autoFixableCount: 0, detectedIDE: true, detectedGitHub: false },
      { autoFixableCount: 0, detectedIDE: false, detectedGitHub: true },
      { autoFixableCount: 5, detectedIDE: true, detectedGitHub: true },
    ];
    for (const ctx of combos) {
      expect(await showActionMenu(ctx)).toBe("exit");
    }
  });
});

describe("showActionMenu — CI env skips menu (smoke: format=text non-CI guard)", () => {
  let savedCI: string | undefined;
  let savedPrompt: string | undefined;
  beforeEach(() => {
    savedCI = process.env.CI;
    savedPrompt = process.env.LYSE_NO_PROMPT;
    process.env.CI = "true";
    delete process.env.LYSE_NO_PROMPT;
  });
  afterEach(() => {
    if (savedCI !== undefined) process.env.CI = savedCI; else delete process.env.CI;
    if (savedPrompt !== undefined) process.env.LYSE_NO_PROMPT = savedPrompt; else delete process.env.LYSE_NO_PROMPT;
  });

  it("isInteractive() returns false in CI — menu is bypassed", () => {
    expect(isInteractive()).toBe(false);
  });

  it("showActionMenu returns exit (not stall) in CI env", async () => {
    const result = await showActionMenu({ autoFixableCount: 5, detectedIDE: true, detectedGitHub: true });
    expect(result).toBe("exit");
  });
});
