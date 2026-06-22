import { describe, it, expect } from "vitest";
import { renderReplBanner } from "../../src/menu/repl.js";

describe("renderReplBanner", () => {
  it("shows the lyse wordmark, version, and the no-menu tip", () => {
    const out = renderReplBanner({ cwd: "/work/acme", quiet: false, version: "0.2.0" });
    expect(out).toContain("lyse");
    expect(out).toContain("0.2.0");
    expect(out).toContain("/work/acme");
    expect(out).toContain("--no-menu");
  });
});
