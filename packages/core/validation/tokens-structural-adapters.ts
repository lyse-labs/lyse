import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-struct", version: "1.0.0" });

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
  deprecatedTokenUsageAdapter,
  themeModesAdapter,
  cssCustomPropertyExportAdapter,
  responsiveBreakpointsAdapter,
  containerQueryAdapter,
];
