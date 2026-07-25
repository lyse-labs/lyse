import { describe, it, expect } from "vitest";
import { injectDrift } from "./inject.js";

describe("injectDrift", () => {
  it("replaces the marker and reports its 1-based line", () => {
    const src = ".a { color: red; }\n.b { color: /*DRIFT*/var(--brand); }\n";
    const { source, line } = injectDrift(src, "/*DRIFT*/var(--brand)", "#3b82f6");
    expect(source).toBe(".a { color: red; }\n.b { color: #3b82f6; }\n");
    expect(line).toBe(2);
  });

  it("throws if the marker is absent (a fixture bug must be loud)", () => {
    expect(() => injectDrift("x", "nope", "y")).toThrow(/marker/);
  });
});
