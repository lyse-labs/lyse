import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prompts from "prompts";
import { confirmBypass } from "../../src/menu/prompts.js";

function setTTY(value: boolean | undefined): () => void {
  const orig = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true });
  return () => Object.defineProperty(process.stdout, "isTTY", { value: orig, configurable: true });
}

// `confirmBypass` routes through `isInteractive()`, which short-circuits on
// LYSE_YES / LYSE_NO_PROMPT / CI. CI runners set `CI=true` ambiently, which
// would otherwise make the "real TTY → prompts" branch auto-proceed and flip
// these assertions. Snapshot + clear all three before each test and restore
// after, so every case exercises exactly the branch it intends regardless of
// the ambient environment or test-execution order.
const GATE_ENV = ["LYSE_YES", "LYSE_NO_PROMPT", "CI"] as const;

describe("confirmBypass", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const k of GATE_ENV) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    prompts.override({});
    for (const k of GATE_ENV) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("returns true without prompting when stdout is not a TTY (safe no-TTY default: proceed)", async () => {
    const restore = setTTY(false);
    try {
      const result = await confirmBypass("Continue?");
      expect(result).toBe(true);
    } finally {
      restore();
    }
  });

  it("returns true without prompting when LYSE_YES=1, even on a real TTY", async () => {
    const restore = setTTY(true);
    process.env.LYSE_YES = "1";
    try {
      const result = await confirmBypass("Continue?");
      expect(result).toBe(true);
    } finally {
      restore();
    }
  });

  it("returns true without prompting when CI=true, even on a real TTY", async () => {
    const restore = setTTY(true);
    process.env.CI = "true";
    try {
      const result = await confirmBypass("Continue?");
      expect(result).toBe(true);
    } finally {
      restore();
    }
  });

  it("on a real TTY (no gate env), shows the prompt and defaults to 'no' when declined", async () => {
    const restore = setTTY(true);
    try {
      prompts.override({ v: false });
      const result = await confirmBypass("Continue?");
      expect(result).toBe(false);
    } finally {
      restore();
    }
  });

  it("on a real TTY (no gate env), returns true when the user explicitly confirms", async () => {
    const restore = setTTY(true);
    try {
      prompts.override({ v: true });
      const result = await confirmBypass("Continue?");
      expect(result).toBe(true);
    } finally {
      restore();
    }
  });
});
