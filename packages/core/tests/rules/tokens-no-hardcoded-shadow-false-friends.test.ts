import { describe, it, expect } from "vitest";
import { ruleFlagged, ruleReported } from "../../validation/audit-probe.js";
import { shadowAdapter } from "../../validation/adapters/tokens-no-hardcoded-shadow.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

// Brief Step 1 seeds
const SEEDS: Array<[string, Record<string, string>]> = [
  ["token-def", { "package.json": PKG, "tokens/elevation.ts": 'export const e = { sm: "0 1px 2px rgba(0,0,0,.1)" };' }],
  ["var-usage", { "package.json": PKG, "a.css": ".x{ box-shadow: var(--shadow-sm); }" }],
  ["none-keyword", { "package.json": PKG, "a.css": ".x{ box-shadow: none; }" }],
  ["css-comment", { "package.json": PKG, "a.css": "/* box-shadow: 0 2px 4px rgba(0,0,0,0.3) — old */\n.x{color:red}" }],
  ["css-custom-prop", { "package.json": PKG, "tokens/elevation.css": ":root { --shadow-sm: 0 1px 3px rgba(0,0,0,0.1); }" }],
];

describe("shadow rule ignores seed false-friends", () => {
  for (const [name, files] of SEEDS) {
    it(`does not flag: ${name}`, async () => {
      expect(await ruleFlagged(files, "tokens/no-hardcoded-shadow")).toBe(false);
    });
  }
});

describe("shadow rule ignores all adapter false-friends", () => {
  const friends = shadowAdapter.falseFriends ?? [];
  it(`corpus has at least 30 false-friends`, () => {
    expect(friends.length).toBeGreaterThanOrEqual(30);
  });

  for (const [idx, files] of friends.entries()) {
    it(`does not flag false-friend #${idx + 1}`, async () => {
      expect(await ruleFlagged(files, "tokens/no-hardcoded-shadow")).toBe(false);
    });
  }
});

describe("shadow rule still detects real violations", () => {
  // Task 8: tokens/no-hardcoded-shadow is migrated onto the four-class
  // resolver. Shadows are a pure composite axis (a box-shadow tuple has no
  // defensible single-scalar distance), so `near` is unreachable and a real,
  // unmatched literal resolves `novel` — reported at `info`, not `warning`,
  // regardless of what token scale the fixture declares (see
  // tokens-no-hardcoded-shadow.ts's `shadowVerdict` docstring). `ruleFlagged`
  // only counts error/warning, so it can no longer see this; `ruleReported`
  // checks for the finding at any severity, which is what "still detects" now
  // means for this axis — the rule stays honest (not silent), just less
  // confident when it has no scale to compare against.
  for (const mutation of shadowAdapter.mutations) {
    it(`flags mutation: ${mutation.name}`, async () => {
      const files = mutation.apply(shadowAdapter.cleanFixture());
      expect(await ruleReported(files, "tokens/no-hardcoded-shadow")).toBe(true);
    });
  }
});
