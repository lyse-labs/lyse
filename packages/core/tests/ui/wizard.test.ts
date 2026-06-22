import { describe, it, expect, vi, afterEach } from "vitest";
import { wizardConfirm, wizardIntro, wizardNote, wizardTask } from "../../src/ui/wizard.js";

afterEach(() => vi.restoreAllMocks());

describe("ui/wizard non-interactive contract", () => {
  it("wizardConfirm returns the default without prompting when non-interactive", async () => {
    // vitest runs with no TTY -> isInteractive() is false
    await expect(wizardConfirm("Proceed?", true)).resolves.toBe(true);
    await expect(wizardConfirm("Proceed?", false)).resolves.toBe(false);
  });

  it("wizardConfirm defaults to true when no default is given", async () => {
    await expect(wizardConfirm("Proceed?")).resolves.toBe(true);
  });

  it("decorative output degrades to plain console.log when non-interactive", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    wizardIntro("lyse init");
    wizardNote("Nuxt 3 · TypeScript", "Stack detected");
    expect(spy).toHaveBeenCalled();
    const printed = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("lyse init");
    expect(printed).toContain("Stack detected");
    expect(printed).toContain("Nuxt 3 · TypeScript");
  });

  it("wizardTask runs the fn and returns its value when non-interactive", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = await wizardTask("Scanning…", "Done", async () => 42);
    expect(out).toBe(42);
    expect(spy).toHaveBeenCalledWith("Scanning…");
  });

  it("wizardTask propagates errors", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      wizardTask("Scanning…", "Done", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

import { wizardSelect } from "../../src/ui/wizard.js";

describe("ui/wizard wizardSelect non-interactive contract", () => {
  const opts = [
    { value: "a" as const, label: "Alpha" },
    { value: "b" as const, label: "Bravo" },
  ];

  it("returns the explicit default without prompting when non-interactive", async () => {
    await expect(wizardSelect("Pick", opts, "b")).resolves.toBe("b");
  });

  it("falls back to the first option when no default is given", async () => {
    await expect(wizardSelect("Pick", opts)).resolves.toBe("a");
  });
});
