import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-llms", version: "1.0.0" });

// Rule requires: H1 at first meaningful line, blockquote after H1, ≥1 ## section heading.
// Malformed links (list items under ## with missing title or url) are also caught.
const GOOD_LLMS_TXT = [
  "# fx-llms",
  "",
  "> A design system component library.",
  "",
  "## Docs",
  "- [Components](https://example.com/components): component reference",
  "",
  "## Usage",
  "- [Getting Started](https://example.com/start): install and import components.",
  "",
].join("\n");

function clean(): FixtureFiles {
  return { "package.json": PKG, "llms.txt": GOOD_LLMS_TXT };
}

export const llmsTxtAdapter: OracleAdapter = {
  ruleId: "ai-surface/llms-txt-structure",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    // Missing file entirely — warns about absent llms.txt.
    { name: "missing-file", apply: (f) => { const { "llms.txt": _omit, ...rest } = f; return rest; } },
    // No H1 — first line is not a heading.
    { name: "no-h1", apply: (f) => ({ ...f, "llms.txt": GOOD_LLMS_TXT.replace("# fx-llms\n", "fx-llms\n") }) },
    // No blockquote — remove the > summary line.
    { name: "no-blockquote", apply: (f) => ({ ...f, "llms.txt": GOOD_LLMS_TXT.replace("> A design system component library.\n", "") }) },
    // No ## section headings.
    { name: "no-sections", apply: (f) => ({
      ...f,
      "llms.txt": [
        "# fx-llms",
        "",
        "> A design system component library.",
        "",
        "Just some prose, no section headings.",
        "",
      ].join("\n"),
    }) },
    // Empty file — triggers all structural checks.
    { name: "empty", apply: (f) => ({ ...f, "llms.txt": "" }) },
    // Malformed link: missing URL.
    { name: "malformed-link-no-url", apply: (f) => ({
      ...f,
      "llms.txt": [
        "# fx-llms",
        "",
        "> A design system component library.",
        "",
        "## Docs",
        "- [Components](): component reference",
        "",
      ].join("\n"),
    }) },
  ],
  metamorphic: [],
};
