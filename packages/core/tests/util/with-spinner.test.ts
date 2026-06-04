import { describe, it, expect, vi } from "vitest";
import type { Spinner } from "../../src/util/spinner.js";

vi.mock("../../src/util/spinner.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/util/spinner.js")>("../../src/util/spinner.js");
  return {
    ...actual,
    createSpinner: vi.fn(),
  };
});

import { createSpinner } from "../../src/util/spinner.js";
import { withSpinner } from "../../src/util/with-spinner.js";

function makeStub(): Spinner & { _calls: { start: string[]; update: string[]; succeed: string[]; fail: string[] } } {
  const _calls = { start: [] as string[], update: [] as string[], succeed: [] as string[], fail: [] as string[] };
  return {
    _calls,
    start: (l: string) => { _calls.start.push(l); },
    update: (l: string) => { _calls.update.push(l); },
    succeed: (l: string) => { _calls.succeed.push(l); },
    fail: (l: string) => { _calls.fail.push(l); },
    stop: () => {},
  } as Spinner & { _calls: typeof _calls };
}

describe("withSpinner", () => {
  it("calls start → fn → succeed on the happy path", async () => {
    const stub = makeStub();
    vi.mocked(createSpinner).mockReturnValue(stub);
    const out = await withSpinner(
      { isTTY: true, quiet: false, startLabel: "Working…", successLabel: (r) => `Done: ${r}` },
      async (sp) => { sp.update("phase 2"); return 42; },
    );
    expect(out).toBe(42);
    expect(stub._calls.start).toEqual(["Working…"]);
    expect(stub._calls.update).toEqual(["phase 2"]);
    expect(stub._calls.succeed).toEqual(["Done: 42"]);
    expect(stub._calls.fail).toEqual([]);
  });

  it("calls fail and rethrows on error", async () => {
    const stub = makeStub();
    vi.mocked(createSpinner).mockReturnValue(stub);
    await expect(
      withSpinner(
        { isTTY: true, quiet: false, startLabel: "Work…", successLabel: () => "ok", failLabel: (m) => `bad: ${m}` },
        async () => { throw new Error("boom"); },
      ),
    ).rejects.toThrow("boom");
    expect(stub._calls.fail).toEqual(["bad: boom"]);
  });

  it("uses a no-op spinner when quiet=true (createSpinner called with enabled=false)", async () => {
    vi.mocked(createSpinner).mockClear();
    vi.mocked(createSpinner).mockReturnValue(makeStub());
    await withSpinner(
      { isTTY: true, quiet: true, startLabel: "x", successLabel: () => "y" },
      async () => undefined,
    );
    expect(createSpinner).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("uses a no-op spinner when isTTY=false", async () => {
    vi.mocked(createSpinner).mockClear();
    vi.mocked(createSpinner).mockReturnValue(makeStub());
    await withSpinner(
      { isTTY: false, startLabel: "x", successLabel: () => "y" },
      async () => undefined,
    );
    expect(createSpinner).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("uses a no-op spinner when machineFormat=true", async () => {
    vi.mocked(createSpinner).mockClear();
    vi.mocked(createSpinner).mockReturnValue(makeStub());
    await withSpinner(
      { isTTY: true, machineFormat: true, startLabel: "x", successLabel: () => "y" },
      async () => undefined,
    );
    expect(createSpinner).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("respects LYSE_QUIET=1 env var", async () => {
    vi.mocked(createSpinner).mockClear();
    vi.mocked(createSpinner).mockReturnValue(makeStub());
    const orig = process.env["LYSE_QUIET"];
    process.env["LYSE_QUIET"] = "1";
    try {
      await withSpinner(
        { isTTY: true, startLabel: "x", successLabel: () => "y" },
        async () => undefined,
      );
      expect(createSpinner).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    } finally {
      if (orig === undefined) delete process.env["LYSE_QUIET"];
      else process.env["LYSE_QUIET"] = orig;
    }
  });
});
