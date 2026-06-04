import { describe, it, expect, vi } from "vitest";
import type { Spinner } from "../../src/util/spinner.js";

vi.mock("../../src/util/spinner.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/util/spinner.js")>("../../src/util/spinner.js");
  const calls = { succeed: [] as string[] };
  return {
    ...actual,
    createSpinner: () => ({
      start: () => {},
      update: () => {},
      succeed: (l: string) => calls.succeed.push(l),
      fail: () => {},
      stop: () => {},
    } as Spinner),
    __getCalls: () => calls,
  };
});

import { withSpinner } from "../../src/util/with-spinner.js";

describe("withSpinner wrapping for commands (smoke)", () => {
  it("emits success label after fn resolves", async () => {
    const labels: string[] = [];
    await withSpinner(
      { isTTY: true, quiet: false, startLabel: "start", successLabel: () => "ok" },
      async () => { labels.push("ran"); },
    );
    expect(labels).toEqual(["ran"]);
  });
});
