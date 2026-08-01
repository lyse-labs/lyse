import { describe, it, expect } from "vitest";
import { unknownFlags, assertKnownFlags } from "../unknown-flags.js";

const DECLARED = { root: {}, format: {}, "min-severity": {}, quiet: {} };

describe("unknownFlags", () => {
  it("returns nothing when every flag is declared", () => {
    expect(unknownFlags({ root: ".", format: "json", quiet: true }, DECLARED)).toEqual([]);
  });

  it("catches a typo that would otherwise silently disable a CI gate", () => {
    expect(unknownFlags({ root: ".", treshold: 99 }, DECLARED)).toEqual(["treshold"]);
  });

  it("ignores citty's positional bucket and internal keys", () => {
    expect(unknownFlags({ _: ["."], "--": [], root: "." }, DECLARED)).toEqual([]);
  });

  it("accepts the camelCase alias citty derives from a kebab-case flag", () => {
    expect(unknownFlags({ minSeverity: "error" }, DECLARED)).toEqual([]);
  });

  it("accepts the no- prefixed negation of a declared boolean", () => {
    expect(unknownFlags({ "no-quiet": true }, DECLARED)).toEqual([]);
  });

  it("accepts citty's normalisation of a declared no- flag: --no-color arrives as `color`", () => {
    const declared = { "no-color": {}, "no-prompt": {}, "no-telemetry": {} };
    expect(unknownFlags({ color: false, prompt: false, telemetry: false }, declared)).toEqual([]);
  });

  it("reports several unknown flags, sorted, without duplicates", () => {
    expect(unknownFlags({ zzz: 1, aaa: 2, zzz2: 3 }, DECLARED)).toEqual(["aaa", "zzz", "zzz2"]);
  });
});

describe("assertKnownFlags", () => {
  it("throws a usage error naming the offending flag", () => {
    expect(() => assertKnownFlags({ treshold: 99 }, DECLARED, "audit")).toThrowError(
      /unknown option .*--treshold/i,
    );
  });

  it("stays silent on a valid invocation", () => {
    expect(() => assertKnownFlags({ format: "json" }, DECLARED, "audit")).not.toThrow();
  });
});
