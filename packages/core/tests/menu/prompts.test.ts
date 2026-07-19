import { describe, it, expect, afterEach } from "vitest";
import prompts from "prompts";
import { confirmBypass } from "../../src/menu/prompts.js";

function setTTY(value: boolean | undefined): () => void {
  const orig = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true });
  return () => Object.defineProperty(process.stdout, "isTTY", { value: orig, configurable: true });
}

describe("confirmBypass", () => {
  afterEach(() => {
    prompts.override({});
    delete process.env.LYSE_YES;
    delete process.env.LYSE_NO_PROMPT;
    delete process.env.CI;
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

  it("returns true without prompting when CI=true", async () => {
    const restore = setTTY(false);
    process.env.CI = "true";
    try {
      const result = await confirmBypass("Continue?");
      expect(result).toBe(true);
    } finally {
      restore();
    }
  });

  it("on a real TTY, shows the prompt and defaults to 'no' when declined", async () => {
    const restore = setTTY(true);
    try {
      prompts.override({ v: false });
      const result = await confirmBypass("Continue?");
      expect(result).toBe(false);
    } finally {
      restore();
    }
  });

  it("on a real TTY, returns true when the user explicitly confirms", async () => {
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
