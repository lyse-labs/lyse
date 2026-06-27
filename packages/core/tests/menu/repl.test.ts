import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  REPL_ACTIONS,
  renderReplBanner,
  runRepl,
  withExitGuard,
  type ReplActionId,
  type ReplContext,
} from "../../src/menu/repl.js";

describe("REPL_ACTIONS", () => {
  it("lists exactly the documented set in spec order", () => {
    const ids = REPL_ACTIONS.map((a) => a.id);
    expect(ids).toEqual([
      "audit",
      "handoff",
      "mcp-setup",
      "explain",
      "bench-pack",
      "telemetry",
      "exit",
    ]);
  });

  it("every action has a title and description", () => {
    for (const a of REPL_ACTIONS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it("titles match the spec (Run audit · Hand off to your agent · Set up MCP for AI · Explain a rule · Bench-pack · Telemetry settings · Exit)", () => {
    const titles = REPL_ACTIONS.map((a) => a.title);
    expect(titles).toEqual([
      "Run audit",
      "Hand off to your agent",
      "Set up MCP for AI",
      "Explain a rule",
      "Bench-pack",
      "Telemetry settings",
      "Exit",
    ]);
  });
});

describe("renderReplBanner", () => {
  it("matches snapshot for deterministic version + cwd", () => {
    const out = renderReplBanner({ cwd: "/tmp/demo", quiet: false, version: "9.9.9" });
    expect(out).toMatchInlineSnapshot(`
      "
        lyse  interactive menu   9.9.9
        /tmp/demo

        Tip: pass --no-menu (or set LYSE_NO_MENU=1) to skip the menu.
        Or invoke a subcommand directly (lyse audit, lyse handoff, …).
      "
    `);
  });
});

describe("runRepl — non-interactive skip", () => {
  // In test env stdout.isTTY is false → isInteractive() is false → runRepl returns
  // immediately without prompting or dispatching anything.
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.LYSE_NO_PROMPT;
    process.env.LYSE_NO_PROMPT = "1";
  });
  afterEach(() => {
    if (saved !== undefined) process.env.LYSE_NO_PROMPT = saved;
    else delete process.env.LYSE_NO_PROMPT;
  });

  it("returns immediately and never invokes dispatch", async () => {
    let dispatched = 0;
    const dispatch = async () => {
      dispatched += 1;
    };
    const start = Date.now();
    await runRepl({ cwd: "/tmp", quiet: false, version: "0.0.0" }, dispatch);
    expect(Date.now() - start).toBeLessThan(500);
    expect(dispatched).toBe(0);
  });
});

describe("withExitGuard", () => {
  it("returns the wrapped fn's value when it doesn't call process.exit", async () => {
    const out = await withExitGuard(async () => 42);
    expect(out).toBe(42);
  });

  it("converts process.exit(N) into a sentinel throw the REPL can catch", async () => {
    let caughtMessage: string | undefined;
    try {
      await withExitGuard(async () => {
        process.exit(7);
      });
    } catch (e) {
      caughtMessage = (e as Error).message;
    }
    expect(caughtMessage).toBe("__LYSE_REPL_EXIT_7__");
  });

  it("restores the real process.exit after the wrapped fn returns", async () => {
    const before = process.exit;
    await withExitGuard(async () => undefined);
    expect(process.exit).toBe(before);
  });

  it("restores the real process.exit even after the wrapped fn throws", async () => {
    const before = process.exit;
    try {
      await withExitGuard(async () => {
        process.exit(1);
      });
    } catch {
      // expected
    }
    expect(process.exit).toBe(before);
  });
});

// Smoke: action IDs are exhaustive and discriminated as expected by TS callers.
describe("ReplActionId discriminated union", () => {
  it("covers all REPL_ACTIONS ids", () => {
    const ids: ReplActionId[] = REPL_ACTIONS.map((a) => a.id);
    const seen = new Set<ReplActionId>(ids);
    const expected = new Set<ReplActionId>([
      "audit",
      "handoff",
      "mcp-setup",
      "explain",
      "bench-pack",
      "telemetry",
      "exit",
    ]);
    expect(seen).toEqual(expected);
  });

  it("ReplContext is well-formed", () => {
    const ctx: ReplContext = { cwd: "/tmp", quiet: false, version: "0.0.0" };
    expect(ctx.cwd).toBe("/tmp");
  });
});
