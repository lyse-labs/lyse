import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-struct", version: "1.0.0" });

// ---------------------------------------------------------------------------
// tokens/dtcg-conformance
// Rule discovers: **/*.tokens.json, tokens/**/*.json, **/tokens/**/*.json
// Fires: token has $value but no $type, unresolved alias, invalid typed value.
// N/A: no DTCG-shaped files found.
// ---------------------------------------------------------------------------

const VALID_DTCG = JSON.stringify({
  color: { brand: { $value: "#2563eb", $type: "color" } },
});

const VALID_DTCG_EXTRA = JSON.stringify({
  spacing: { sm: { $value: "8px", $type: "dimension" } },
});

function dtcgClean(): FixtureFiles {
  return {
    "package.json": PKG,
    "tokens/color.tokens.json": VALID_DTCG,
  };
}

export const dtcgConformanceAdapter: OracleAdapter = {
  ruleId: "tokens/dtcg-conformance",
  oracleKind: "construction",
  cleanFixture: dtcgClean,
  mutations: [
    {
      name: "missing-type",
      apply: (f) => ({
        ...f,
        "tokens/color.tokens.json": JSON.stringify({ color: { brand: { $value: "#2563eb" } } }),
      }),
    },
    {
      name: "bad-alias",
      apply: (f) => ({
        ...f,
        "tokens/color.tokens.json": JSON.stringify({
          color: { brand: { $value: "{color.nonexistent}", $type: "color" } },
        }),
      }),
    },
    {
      name: "invalid-dimension",
      apply: (f) => ({
        ...f,
        "tokens/color.tokens.json": JSON.stringify({
          spacing: { sm: { $value: "8", $type: "dimension" } },
        }),
      }),
    },
  ],
  metamorphic: [
    {
      name: "two-valid-token-shapes-both-clean",
      a: { "package.json": PKG, "tokens/color.tokens.json": VALID_DTCG },
      b: { "package.json": PKG, "tokens/color.tokens.json": VALID_DTCG_EXTRA },
      expectViolation: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// tokens/description-coverage
// Rule: semantic tokens (path segment in action/surface/text/…) with $description
//       must be ≥80%. Fires one summary finding when below threshold.
// N/A: no DTCG files, or no semantic tokens.
// ---------------------------------------------------------------------------

const DESCRIBED_SEMANTIC = JSON.stringify({
  action: {
    primary: {
      $value: "#2563eb",
      $type: "color",
      $description: "Default action color for primary CTAs",
    },
    secondary: {
      $value: "#64748b",
      $type: "color",
      $description: "Secondary action color for muted interactions",
    },
  },
});

const UNDESCRIBED_SEMANTIC = JSON.stringify({
  action: {
    primary: { $value: "#2563eb", $type: "color" },
    secondary: { $value: "#64748b", $type: "color" },
  },
});

function descriptionClean(): FixtureFiles {
  return {
    "package.json": PKG,
    "tokens/semantic.tokens.json": DESCRIBED_SEMANTIC,
  };
}

export const descriptionCoverageAdapter: OracleAdapter = {
  ruleId: "tokens/description-coverage",
  oracleKind: "construction",
  cleanFixture: descriptionClean,
  mutations: [
    {
      name: "no-descriptions",
      apply: (f) => ({
        ...f,
        "tokens/semantic.tokens.json": UNDESCRIBED_SEMANTIC,
      }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// tokens/deprecated-token-usage
// Rule: non-deprecated token aliases a deprecated token → fires.
// N/A: no DTCG files, or no tokens, or no deprecated tokens.
// ---------------------------------------------------------------------------

const CLEAN_ALIAS = JSON.stringify({
  color: {
    old: { $value: "#000", $deprecated: "use color.ink" },
    ink: { $value: "#111111", $type: "color" },
    text: { $value: "{color.ink}", $type: "color" },
  },
});

const DEPRECATED_ALIAS = JSON.stringify({
  color: {
    old: { $value: "#000", $deprecated: true },
    text: { $value: "{color.old}", $type: "color" },
  },
});

function deprecatedClean(): FixtureFiles {
  return {
    "package.json": PKG,
    "tokens/color.tokens.json": CLEAN_ALIAS,
  };
}

export const deprecatedTokenUsageAdapter: OracleAdapter = {
  ruleId: "tokens/deprecated-token-usage",
  oracleKind: "construction",
  cleanFixture: deprecatedClean,
  mutations: [
    {
      name: "alias-to-deprecated",
      apply: (f) => ({
        ...f,
        "tokens/color.tokens.json": DEPRECATED_ALIAS,
      }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// tokens/theme-modes-present
// Rule checks files.css for .dark/.light, prefers-color-scheme, [data-theme],
// or scans token files on disk for "dark"/"light" groups.
// Fires: no mode signal found anywhere. opportunities=1 (always applicable).
// ---------------------------------------------------------------------------

function themeModeClean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/tokens.css": ":root { --color-bg: #fff; }\n.dark { --color-bg: #111; }\n",
  };
}

export const themeModesAdapter: OracleAdapter = {
  ruleId: "tokens/theme-modes-present",
  oracleKind: "construction",
  cleanFixture: themeModeClean,
  mutations: [
    {
      name: "remove-mode",
      apply: (f) => ({
        ...f,
        "src/tokens.css": ":root { color: red; }\n",
      }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// tokens/css-custom-property-export
// Rule: CSS has styling (RE_DECLARATION matches) but no custom-prop definition.
// Fires when: hasStyling=true AND definesCustomProperty=false.
// N/A: no CSS at all.
// ---------------------------------------------------------------------------

function cssCustomPropClean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/tokens.css": ":root { --color-primary: #3b82f6; }\n.btn { color: var(--color-primary); }\n",
  };
}

export const cssCustomPropertyExportAdapter: OracleAdapter = {
  ruleId: "tokens/css-custom-property-export",
  oracleKind: "construction",
  cleanFixture: cssCustomPropClean,
  mutations: [
    {
      name: "no-custom-props",
      apply: (f) => ({
        ...f,
        "src/tokens.css": ".btn { color: #3b82f6; background: #1e293b; }\n",
      }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// tokens/responsive-breakpoints
// Rule: CSS has width @media → responsive=true.
//   hasScale: RE_BP_VAR matches ($bp*, --breakpoint*, --bp*, --screen*), OR ctx.tokens.breakpoints, OR files.ts RE_BP_OBJECT.
// Clean: @media with --breakpoint-md var defined → clears.
// Mutation: @media but no breakpoint var anywhere.
// ---------------------------------------------------------------------------

function responsiveBreakpointsClean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/tokens.css": "--breakpoint-md: 768px;\n@media (min-width: 768px) { .grid { display: grid; } }\n",
  };
}

export const responsiveBreakpointsAdapter: OracleAdapter = {
  ruleId: "tokens/responsive-breakpoints",
  oracleKind: "construction",
  cleanFixture: responsiveBreakpointsClean,
  mutations: [
    {
      name: "no-scale",
      apply: (f) => ({
        ...f,
        "src/tokens.css": "@media (min-width: 768px) { .grid { display: grid; } }\n",
      }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// tokens/container-query
// Rule: @container is used (usesCq=true) but no container-type/container-name/container: declared.
// N/A: no @container at all.
// ---------------------------------------------------------------------------

function containerQueryClean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/tokens.css": ".card-wrap { container-type: inline-size; }\n@container (min-width: 400px) { .card { display: grid; } }\n",
  };
}

export const containerQueryAdapter: OracleAdapter = {
  ruleId: "tokens/container-query",
  oracleKind: "construction",
  cleanFixture: containerQueryClean,
  mutations: [
    {
      name: "no-context",
      apply: (f) => ({
        ...f,
        "src/tokens.css": "@container (min-width: 400px) { .card { display: grid; } }\n",
      }),
    },
  ],
  metamorphic: [],
};

export const tokensStructuralAdapters = [
  dtcgConformanceAdapter,
  descriptionCoverageAdapter,
  deprecatedTokenUsageAdapter,
  themeModesAdapter,
  cssCustomPropertyExportAdapter,
  responsiveBreakpointsAdapter,
  containerQueryAdapter,
];
