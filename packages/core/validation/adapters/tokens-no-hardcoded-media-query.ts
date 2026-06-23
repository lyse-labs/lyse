import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-mq", version: "1.0.0" });

function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/tokens.css": "@media print { .a { display: none; } }",
  };
}

export const mediaQueryAdapter: OracleAdapter = {
  ruleId: "tokens/no-hardcoded-media-query",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    {
      name: "literal-width",
      apply: (f) => ({ ...f, "src/tokens.css": "@media (min-width: 768px) { .a { display: flex; } }" }),
    },
    {
      name: "range-literal",
      apply: (f) => ({ ...f, "src/tokens.css": "@media (width >= 1024px) { .a { display: grid; } }" }),
    },
  ],
  metamorphic: [
    {
      name: "two-px-literals-both-flag",
      a: { "package.json": PKG, "src/tokens.css": "@media (min-width: 768px) { .a { display: flex; } }" },
      b: { "package.json": PKG, "src/tokens.css": "@media (max-width: 1024px) { .a { display: block; } }" },
      expectViolation: true,
    },
  ],
};
