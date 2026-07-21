import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-mq", version: "1.0.0" });

// tokens/no-hardcoded-media-query is resolver-migrated (Task 7): `exact` (on
// the repo's own breakpoint scale) is compliant, not drift. With no
// breakpoint tokens at all the axis has no built-in fallback (unlike
// spacing — see graph/resolve/scales.ts's DEFAULT_SCALES), so an off-scale
// literal resolves `novel`, which this rule reports at `info` severity — and
// this oracle only counts error/warning as a flag (audit-probe.ts#ruleFlagged),
// so an untokened fixture would read as a false negative. A real (and
// deliberately different) breakpoint scale is what makes 768px/1024px land
// `near` (warning) instead.
//
// This must be a DTCG tokens.json, not a plain `:root { --breakpoint-*: … }`
// custom property: the graph's CSS-custom-property extraction path derives
// the axis solely from the DTCG `$type` (dtcgDocumentToNodes's
// DTCG_TYPE_TO_AXIS), and every `dimension` collapses onto `spacing`
// regardless of property name. A tokens.json instead routes through
// loaders/tokens.ts#fromDtcg's path heuristic (`/breakpoint|screen/i`),
// landing correctly on `breakpoints` — verified empirically, see Task 7's
// report.
const BREAKPOINT_TOKENS = JSON.stringify({
  breakpoint: {
    sm: { $value: "320px", $type: "dimension" },
    lg: { $value: "1280px", $type: "dimension" },
  },
});

function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/breakpoints.tokens.json": BREAKPOINT_TOKENS,
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
      a: {
        "package.json": PKG,
        "src/breakpoints.tokens.json": BREAKPOINT_TOKENS,
        "src/tokens.css": "@media (min-width: 768px) { .a { display: flex; } }",
      },
      b: {
        "package.json": PKG,
        "src/breakpoints.tokens.json": BREAKPOINT_TOKENS,
        "src/tokens.css": "@media (max-width: 1024px) { .a { display: block; } }",
      },
      expectViolation: true,
    },
  ],
};
