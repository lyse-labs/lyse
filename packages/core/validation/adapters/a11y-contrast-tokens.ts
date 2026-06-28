import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-contrast", version: "1.0.0" });

// #111111 on #ffffff ≈ 18.88:1 — well above both thresholds
function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/Widget.css": ".x { color: #111111; background: #ffffff; }",
  };
}

export const contrastTokensAdapter: OracleAdapter = {
  ruleId: "a11y/contrast-tokens",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    // CSS: low-contrast literal pair (2.85:1 < 4.5:1)
    {
      name: "css-low-contrast-fg-bg",
      apply: (f) => ({ ...f, "src/Widget.css": ".x { color: #999999; background: #ffffff; }" }),
    },
    // CSS: background-color property (not shorthand)
    {
      name: "css-background-color-property",
      apply: (f) => ({ ...f, "src/Widget.css": ".x { color: #999999; background-color: #ffffff; }" }),
    },
    // Inline style in JSX: low-contrast pair
    {
      name: "inline-style-low-contrast",
      apply: (f) => ({
        ...f,
        "src/Widget.tsx": 'export const W = () => <div style={{ color: "#999999", background: "#ffffff" }} />;',
      }),
    },
    // Large text that still fails the 3:1 threshold (#999999 on #fff ≈ 2.85:1)
    {
      name: "css-large-text-still-fails",
      apply: (f) => ({
        ...f,
        "src/Widget.css": ".x { color: #999999; background: #ffffff; font-size: 28px; }",
      }),
    },
  ],
  metamorphic: [
    {
      name: "hex-eq-rgb-low-contrast",
      a: { "package.json": PKG, "src/m.css": ".x { color: #999999; background: #ffffff; }" },
      b: { "package.json": PKG, "src/m.css": ".x { color: rgb(153,153,153); background: rgb(255,255,255); }" },
      expectViolation: true,
    },
    {
      name: "passing-pair-no-flag",
      a: { "package.json": PKG, "src/m.css": ".x { color: #111111; background: #ffffff; }" },
      b: { "package.json": PKG, "src/m.css": ".x { color: #000000; background: #ffffff; }" },
      expectViolation: false,
    },
  ],
};
