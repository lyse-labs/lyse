import type { OracleAdapter, FixtureFiles } from "./types.js";
import { makePresenceAdapter } from "./generic-presence-adapters.js";

const PKG_SEMVER = JSON.stringify({ name: "fx-ai-surface", version: "1.2.0" });
const PKG_NO_VERSION = JSON.stringify({ name: "fx-ai-surface" });
const PKG_BAD_VERSION = JSON.stringify({ name: "fx-ai-surface", version: "latest" });

// ---------------------------------------------------------------------------
// versioning/semver-versioning
// Rule fires when no package.json (root or workspace) carries a valid-semver
// version field.
// ---------------------------------------------------------------------------

const semverVersioningAdapter: OracleAdapter = {
  ruleId: "versioning/semver-versioning",
  oracleKind: "construction",
  cleanFixture: () => ({ "package.json": PKG_SEMVER }),
  mutations: [
    {
      name: "missing-version",
      apply: () => ({ "package.json": PKG_NO_VERSION }),
    },
    {
      name: "non-semver-version",
      apply: () => ({ "package.json": PKG_BAD_VERSION }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// versioning/migration-guide-present
// Rule fires when no MIGRATION.md / UPGRADING.md / migration heading exists.
// ---------------------------------------------------------------------------

const GOOD_MIGRATION_MD = "# Migration Guide\n\n## v2 → v3\n\nChange `Button` to `NewButton`.\n";

const migrationGuidePresentAdapter: OracleAdapter = makePresenceAdapter({
  ruleId: "versioning/migration-guide-present",
  requiredPath: "MIGRATION.md",
  goodContent: GOOD_MIGRATION_MD,
});

// ---------------------------------------------------------------------------
// versioning/deprecation-markers
// Rule scans .ts files for bare @deprecated tags (no guidance).
// Clean = @deprecated with inline description → no flag.
// Mutations = bare @deprecated → flags.
// ---------------------------------------------------------------------------

const GOOD_DEPRECATED_TS = [
  "/** @deprecated Use {@link NewButton} instead. */",
  "export const OldButton = () => null;",
  "",
].join("\n");

const BARE_DEPRECATED_TS = [
  "/** @deprecated */",
  "export const OldButton = () => null;",
  "",
].join("\n");

const BARE_DEPRECATED_MULTILINE_TS = [
  "/**",
  " * @deprecated",
  " */",
  "export const LegacyCard = () => null;",
  "",
].join("\n");

const deprecationMarkersAdapter: OracleAdapter = {
  ruleId: "versioning/deprecation-markers",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SEMVER,
    "src/Button.ts": GOOD_DEPRECATED_TS,
  }),
  mutations: [
    {
      name: "bare-deprecated-inline",
      apply: (f) => ({ ...f, "src/Button.ts": BARE_DEPRECATED_TS }),
    },
    {
      name: "bare-deprecated-multiline",
      apply: (f) => ({ ...f, "src/Button.ts": BARE_DEPRECATED_MULTILINE_TS }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// ai-surface/agents-md-quality
// Rule checks AGENTS.md for:
//   1. fenced code block with runnable command
//   2. exit code reference
//   3. toolchain config file reference
// Clean = all three present. Each mutation removes one signal.
// ---------------------------------------------------------------------------

const GOOD_AGENTS_MD = [
  "# Dev Setup",
  "",
  "Uses package.json for scripts.",
  "",
  "## Install and Test",
  "",
  "```bash",
  "pnpm install && pnpm test",
  "```",
  "",
  "Exit code 0 means clean.",
  "",
].join("\n");

const AGENTS_MD_NO_RUNNABLE = [
  "# Dev Setup",
  "",
  "Uses package.json for scripts.",
  "",
  "## Install and Test",
  "",
  "Run the tests manually.",
  "",
  "Exit code 0 means clean.",
  "",
].join("\n");

const AGENTS_MD_NO_EXIT_CODES = [
  "# Dev Setup",
  "",
  "Uses package.json for scripts.",
  "",
  "## Install and Test",
  "",
  "```bash",
  "pnpm install && pnpm test",
  "```",
  "",
  "All commands complete successfully.",
  "",
].join("\n");

const AGENTS_MD_NO_TOOLCHAIN_REF = [
  "# Dev Setup",
  "",
  "## Install and Test",
  "",
  "```bash",
  "pnpm install && pnpm test",
  "```",
  "",
  "Exit code 0 means clean.",
  "",
].join("\n");

const agentsMdQualityAdapter: OracleAdapter = {
  ruleId: "ai-surface/agents-md-quality",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SEMVER,
    "AGENTS.md": GOOD_AGENTS_MD,
  }),
  mutations: [
    {
      name: "no-runnable-code-block",
      apply: (f) => ({ ...f, "AGENTS.md": AGENTS_MD_NO_RUNNABLE }),
    },
    {
      name: "no-exit-code-reference",
      apply: (f) => ({ ...f, "AGENTS.md": AGENTS_MD_NO_EXIT_CODES }),
    },
    {
      name: "no-toolchain-config-reference",
      apply: (f) => ({ ...f, "AGENTS.md": AGENTS_MD_NO_TOOLCHAIN_REF }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// ai-surface/mcp-config-present
// Rule fires when no .mcp.json / .cursor/mcp.json / claude_desktop_config.json
// exists, or when the file is malformed.
// ---------------------------------------------------------------------------

const GOOD_MCP_JSON = JSON.stringify({
  mcpServers: {
    lyse: { command: "npx", args: ["@lyse-labs/lyse", "mcp"] },
  },
});

const MCP_MISSING_SERVERS_KEY = JSON.stringify({ notServers: {} });

const MCP_EMPTY_SERVERS = JSON.stringify({ mcpServers: {} });

const MCP_MISSING_COMMAND = JSON.stringify({
  mcpServers: { lyse: { args: ["@lyse-labs/lyse", "mcp"] } },
});

const mcpConfigPresentAdapter: OracleAdapter = {
  ruleId: "ai-surface/mcp-config-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SEMVER,
    ".mcp.json": GOOD_MCP_JSON,
  }),
  mutations: [
    {
      name: "missing-file",
      apply: (f) => {
        const next = { ...f };
        delete next[".mcp.json"];
        return next;
      },
    },
    {
      name: "missing-mcpservers-key",
      apply: (f) => ({ ...f, ".mcp.json": MCP_MISSING_SERVERS_KEY }),
    },
    {
      name: "empty-mcpservers",
      apply: (f) => ({ ...f, ".mcp.json": MCP_EMPTY_SERVERS }),
    },
    {
      name: "server-missing-command",
      apply: (f) => ({ ...f, ".mcp.json": MCP_MISSING_COMMAND }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// ai-surface/component-manifest-json
// Rule fires when no components.json / lyse.components.json is found,
// or when the manifest is malformed.
// ---------------------------------------------------------------------------

const GOOD_MANIFEST = JSON.stringify({
  components: [
    { name: "Button", sourceFile: "src/button.tsx" },
    { name: "Card", sourceFile: "src/card.tsx" },
  ],
});

const MANIFEST_NO_COMPONENTS_KEY = JSON.stringify({ stuff: [] });

const MANIFEST_EMPTY_ARRAY = JSON.stringify({ components: [] });

const MANIFEST_ENTRY_MISSING_NAME = JSON.stringify({
  components: [{ sourceFile: "src/button.tsx" }],
});

const componentManifestJsonAdapter: OracleAdapter = {
  ruleId: "ai-surface/component-manifest-json",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SEMVER,
    "lyse.components.json": GOOD_MANIFEST,
  }),
  mutations: [
    {
      name: "no-components-key",
      apply: (f) => ({ ...f, "lyse.components.json": MANIFEST_NO_COMPONENTS_KEY }),
    },
    {
      name: "empty-components-array",
      apply: (f) => ({ ...f, "lyse.components.json": MANIFEST_EMPTY_ARRAY }),
    },
    {
      name: "entry-missing-name",
      apply: (f) => ({ ...f, "lyse.components.json": MANIFEST_ENTRY_MISSING_NAME }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// ai-surface/shadcn-registry-valid
// Rule fires when:
//   (a) components.json present but no registry.json → warning
//   (b) registry.json present but malformed → error
// Clean = valid registry.json (single item shape) + shadcn marker.
// ---------------------------------------------------------------------------

const SHADCN_COMPONENTS_JSON = JSON.stringify({
  $schema: "https://ui.shadcn.com/schema.json",
  style: "default",
  aliases: { components: "@/components", utils: "@/lib/utils" },
});

const GOOD_REGISTRY_JSON = JSON.stringify({
  name: "button",
  type: "registry:ui",
  files: [{ path: "ui/button.tsx" }],
});

const REGISTRY_MISSING_NAME = JSON.stringify({
  type: "registry:ui",
  files: [{ path: "ui/button.tsx" }],
});

const REGISTRY_MISSING_FILES = JSON.stringify({
  name: "button",
  type: "registry:ui",
});

const REGISTRY_EMPTY_FILES = JSON.stringify({
  name: "button",
  type: "registry:ui",
  files: [],
});

const shadcnRegistryValidAdapter: OracleAdapter = {
  ruleId: "ai-surface/shadcn-registry-valid",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SEMVER,
    "components.json": SHADCN_COMPONENTS_JSON,
    "registry.json": GOOD_REGISTRY_JSON,
  }),
  mutations: [
    {
      name: "no-registry-but-shadcn-marker",
      apply: (f) => {
        const next = { ...f };
        delete next["registry.json"];
        return next;
      },
    },
    {
      name: "registry-missing-name",
      apply: (f) => ({ ...f, "registry.json": REGISTRY_MISSING_NAME }),
    },
    {
      name: "registry-missing-files",
      apply: (f) => ({ ...f, "registry.json": REGISTRY_MISSING_FILES }),
    },
    {
      name: "registry-empty-files",
      apply: (f) => ({ ...f, "registry.json": REGISTRY_EMPTY_FILES }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// ai-surface/agent-instruction-files
// Rule fires when neither .cursor/rules/*.mdc nor .claude/skills/*/SKILL.md
// is present, or when found files have invalid frontmatter.
// Clean = valid .cursor/rules/style-guide.mdc with description + globs.
// ---------------------------------------------------------------------------

const GOOD_CURSOR_RULE = [
  "---",
  "description: TypeScript style guide for this monorepo",
  "globs: [\"src/**/*.ts\", \"src/**/*.tsx\"]",
  "alwaysApply: false",
  "---",
  "",
  "# TypeScript style",
  "",
  "Use strict mode. Prefer type aliases over interfaces.",
  "",
].join("\n");

const CURSOR_RULE_NO_DESCRIPTION = [
  "---",
  "globs: [\"src/**/*.ts\"]",
  "---",
  "",
  "# Style",
  "",
].join("\n");

const CURSOR_RULE_NO_GLOBS = [
  "---",
  "description: TypeScript style guide for this monorepo",
  "---",
  "",
  "# Style",
  "",
].join("\n");

const CURSOR_RULE_NO_FRONTMATTER = [
  "# Style",
  "",
  "Use strict mode.",
  "",
].join("\n");

const agentInstructionFilesAdapter: OracleAdapter = {
  ruleId: "ai-surface/agent-instruction-files",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SEMVER,
    ".cursor/rules/style-guide.mdc": GOOD_CURSOR_RULE,
  }),
  mutations: [
    {
      name: "missing-all-instruction-files",
      apply: (f) => {
        const next = { ...f };
        delete next[".cursor/rules/style-guide.mdc"];
        return next;
      },
    },
    {
      name: "cursor-rule-no-description",
      apply: (f) => ({ ...f, ".cursor/rules/style-guide.mdc": CURSOR_RULE_NO_DESCRIPTION }),
    },
    {
      name: "cursor-rule-no-globs",
      apply: (f) => ({ ...f, ".cursor/rules/style-guide.mdc": CURSOR_RULE_NO_GLOBS }),
    },
    {
      name: "cursor-rule-no-frontmatter",
      apply: (f) => ({ ...f, ".cursor/rules/style-guide.mdc": CURSOR_RULE_NO_FRONTMATTER }),
    },
  ],
  metamorphic: [],
};

export const aiSurfaceVersioningAdapters: OracleAdapter[] = [
  semverVersioningAdapter,
  migrationGuidePresentAdapter,
  deprecationMarkersAdapter,
  agentsMdQualityAdapter,
  mcpConfigPresentAdapter,
  componentManifestJsonAdapter,
  shadcnRegistryValidAdapter,
  agentInstructionFilesAdapter,
];
