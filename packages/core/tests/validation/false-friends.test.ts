import { describe, it, expect } from "vitest";
import { evaluateAdapter } from "../../validation/run-adapter.js";
import type { OracleAdapter, FixtureFiles } from "../../validation/types.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

describe("false-friends add negative observations", () => {
  it("counts a wrongly-flagged false-friend as a false positive", async () => {
    const adapter: OracleAdapter = {
      ruleId: "demo/rule",
      oracleKind: "construction",
      cleanFixture: () => ({ "package.json": PKG, "a.css": ".x{color:var(--c)}" }),
      mutations: [{ name: "m", apply: (f: FixtureFiles) => ({ ...f, "a.css": ".x{color:#fff}" }) }],
      metamorphic: [],
      falseFriends: [{ "package.json": PKG, "b.css": ".y{color:#abc}" }],
    };
    // probe flags any fixture whose css contains a hex literal
    const probe = async (files: FixtureFiles) =>
      Object.values(files).some((c) => /#[0-9a-f]{3,6}\b/i.test(c));
    const score = await evaluateAdapter(adapter, probe);
    // clean: tn. mutation: tp. false-friend (has #abc): fp.
    expect(score.matrix).toEqual({ tp: 1, fp: 1, tn: 1, fn: 0 });
  });

  it("counts a correctly-ignored false-friend as a true negative", async () => {
    const adapter: OracleAdapter = {
      ruleId: "demo/rule",
      oracleKind: "construction",
      cleanFixture: () => ({ "package.json": PKG, "a.css": ".x{color:var(--c)}" }),
      mutations: [],
      metamorphic: [],
      falseFriends: [{ "package.json": PKG, "b.css": ".y{color:var(--ok)}" }],
    };
    const probe = async (files: FixtureFiles) =>
      Object.values(files).some((c) => /#[0-9a-f]{3,6}\b/i.test(c));
    const score = await evaluateAdapter(adapter, probe);
    expect(score.matrix).toEqual({ tp: 0, fp: 0, tn: 2, fn: 0 });
  });
});
