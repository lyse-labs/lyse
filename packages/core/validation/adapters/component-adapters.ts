import type { OracleAdapter, FixtureFiles } from "../types.js";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const PKG_SIMPLE = JSON.stringify({ name: "fx-components", version: "1.0.0" });

// Package that looks like a consumer-of-DS app (has @acme/ui in deps).
// The auto-detector picks @acme/ui as componentsModule (branch 1 of detectComponentsModule).
const PKG_CONSUMER = JSON.stringify({
  name: "fx-consumer-app",
  version: "1.0.0",
  dependencies: { "@acme/ui": "^1.0.0", react: "^18.0.0" },
});

// Package used by doc-comments: single package library exposing Button via main entry.
const PKG_LIB = JSON.stringify({
  name: "fx-lib",
  version: "1.0.0",
  main: "src/index.tsx",
});

// ---------------------------------------------------------------------------
// components/svg-viewbox
// Fires on any inline <svg> in a .tsx file that lacks a viewBox attribute.
// ---------------------------------------------------------------------------

const svgViewboxAdapter: OracleAdapter = {
  ruleId: "components/svg-viewbox",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SIMPLE,
    "src/Icon.tsx": 'export const Icon = () => <svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>;',
  }),
  mutations: [
    {
      name: "svg-no-viewbox",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Icon.tsx": 'export const Icon = () => <svg width="24" height="24"><path d="M0 0h24v24H0z"/></svg>;',
      }),
    },
    {
      name: "svg-bare",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Icon.tsx": 'export const Icon = () => <svg><path d="M0 0h24v24H0z"/></svg>;',
      }),
    },
  ],
  metamorphic: [
    {
      name: "viewbox-vs-no-viewbox-both-flag",
      a: {
        "package.json": PKG_SIMPLE,
        "src/Icon.tsx": 'export const A = () => <svg width="16" height="16"><path d="M0 0"/></svg>;',
      },
      b: {
        "package.json": PKG_SIMPLE,
        "src/Icon.tsx": 'export const B = () => <svg><circle r="8"/></svg>;',
      },
      expectViolation: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// components/icon-decorative-aria
// Fires on <svg> in .tsx files without aria-hidden / role / aria-label /
// aria-labelledby and without a <title> child.
// ---------------------------------------------------------------------------

const iconDecorativeAriaAdapter: OracleAdapter = {
  ruleId: "components/icon-decorative-aria",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SIMPLE,
    "src/Icon.tsx": 'export const Icon = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M0 0"/></svg>;',
  }),
  mutations: [
    {
      name: "svg-no-aria",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Icon.tsx": 'export const Icon = () => <svg viewBox="0 0 24 24"><path d="M0 0"/></svg>;',
      }),
    },
    {
      name: "svg-no-role-no-label",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Icon.tsx": 'export const Icon = () => <svg viewBox="0 0 16 16" className="icon"><circle r="8"/></svg>;',
      }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// components/no-icon-fonts
// Fires when any of: icon-font in package.json deps, icon-font @font-face in CSS,
// or icon-font ligature class in source. Uses a single repo-level opportunity.
// ---------------------------------------------------------------------------

const noIconFontsAdapter: OracleAdapter = {
  ruleId: "components/no-icon-fonts",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": JSON.stringify({ name: "fx-no-icon-fonts", version: "1.0.0", dependencies: { "lucide-react": "^0.1.0" } }),
    "src/Icon.tsx": 'import { Home } from "lucide-react";\nexport const Icon = () => <Home aria-hidden />;',
  }),
  mutations: [
    {
      name: "material-icons-dep",
      apply: (): FixtureFiles => ({
        "package.json": JSON.stringify({ name: "fx-no-icon-fonts", version: "1.0.0", dependencies: { "material-icons": "^1.0.0" } }),
        "src/Icon.tsx": "export const Icon = () => null;",
      }),
    },
    {
      name: "font-awesome-css",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/icons.css": "@font-face { font-family: 'Font Awesome 5 Free'; src: url('./fa.woff2'); }",
      }),
    },
    {
      name: "material-icons-class-in-tsx",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Icon.tsx": 'export const Icon = () => <span className="material-icons">home</span>;',
      }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// components/no-native-shadows
// Fires when a file imports from the componentsModule AND uses a native <button>,
// <input>, <select>, <textarea>, or <a>.
// componentsModule is auto-detected from deps: @acme/ui matches branch 1 of
// detectComponentsModule (/^@[^/]+\/(ui|components|design)/).
// ---------------------------------------------------------------------------

const CONSUMER_SRC_CLEAN = [
  'import { Button, Link } from "@acme/ui";',
  "export function Page() {",
  "  return (",
  "    <div>",
  '      <Button onClick={() => {}}>Save</Button>',
  '      <Link href="/about">About</Link>',
  "    </div>",
  "  );",
  "}",
].join("\n");

const CONSUMER_SRC_NATIVE_BUTTON = [
  'import { Button } from "@acme/ui";',
  "export function Page() {",
  "  return (",
  "    <div>",
  "      <Button>Save</Button>",
  '      <button onClick={() => {}}>Raw</button>',
  "    </div>",
  "  );",
  "}",
].join("\n");

const CONSUMER_SRC_NATIVE_INPUT = [
  'import { Input } from "@acme/ui";',
  "export function Form() {",
  '  return <div><Input /><input type="text" /></div>;',
  "}",
].join("\n");

const noNativeShadowsAdapter: OracleAdapter = {
  ruleId: "components/no-native-shadows",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_CONSUMER,
    "src/Page.tsx": CONSUMER_SRC_CLEAN,
  }),
  mutations: [
    {
      name: "native-button-in-ds-consumer",
      apply: (f): FixtureFiles => ({ ...f, "src/Page.tsx": CONSUMER_SRC_NATIVE_BUTTON }),
    },
    {
      name: "native-input-in-ds-consumer",
      apply: (f): FixtureFiles => ({ ...f, "src/Page.tsx": CONSUMER_SRC_NATIVE_INPUT }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// components/doc-comments
// Fires on exported PascalCase components in .tsx files that are re-exported
// from a package entry (i.e. part of the public API) and have no JSDoc.
// The rule uses resolvePublicExports which reads package.json + main/exports.
// Fixture: package.json with "main": "src/index.tsx", src/index.tsx re-exporting
// Button, and src/Button.tsx with/without JSDoc.
// ---------------------------------------------------------------------------

const DOC_SRC_WITH_JSDOC = [
  "/** Primary action button. Use for the most important action on a page. */",
  "export function Button() { return <button />; }",
].join("\n");

const DOC_SRC_WITHOUT_JSDOC = "export function Button() { return <button />; }";

const INDEX_SRC = 'export { Button } from "./Button.js";\n';

const docCommentsAdapter: OracleAdapter = {
  ruleId: "components/doc-comments",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_LIB,
    "src/index.tsx": INDEX_SRC,
    "src/Button.tsx": DOC_SRC_WITH_JSDOC,
  }),
  mutations: [
    {
      name: "missing-jsdoc",
      apply: (f): FixtureFiles => ({ ...f, "src/Button.tsx": DOC_SRC_WITHOUT_JSDOC }),
    },
    {
      name: "missing-jsdoc-arrow",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.tsx": "export const Button = () => <button />;",
      }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// naming/component-pascalcase
// Fires on exported functions returning JSX that are not PascalCase.
// The rule checks .tsx/.jsx files only. HOC (withXxx), hooks (useXxx), and
// factory functions (createXxx) are exempt.
// ---------------------------------------------------------------------------

const namingPascalCaseAdapter: OracleAdapter = {
  ruleId: "naming/component-pascalcase",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SIMPLE,
    "src/Button.tsx": "export function Button() { return <button>click</button>; }",
  }),
  mutations: [
    {
      name: "lowercase-camel",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.tsx": "export function myButton() { return <button>click</button>; }",
      }),
    },
    {
      name: "lowercase-arrow",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.tsx": "export const myCard = () => <div className=\"card\" />;",
      }),
    },
  ],
  metamorphic: [
    {
      name: "camel-vs-snake-both-flag",
      a: {
        "package.json": PKG_SIMPLE,
        "src/x.tsx": "export function myButton() { return <button>x</button>; }",
      },
      b: {
        "package.json": PKG_SIMPLE,
        "src/x.tsx": "export const my_card = () => <div />;",
      },
      expectViolation: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// naming/hook-prefix
// Fires on exported functions that call React hooks internally but are not
// named use<UpperCase>.
// The rule requires body-call evidence (uses useState/useEffect/etc.) OR
// path-evidence (file in hooks/ dir + filename matches function name).
// ---------------------------------------------------------------------------

const HOOK_CLEAN_SRC = [
  "import { useState } from 'react';",
  "export function useCounter() {",
  "  const [count, setCount] = useState(0);",
  "  return { count, setCount };",
  "}",
].join("\n");

const HOOK_BAD_NAME_SRC = [
  "import { useState } from 'react';",
  "export function getCounter() {",
  "  const [count, setCount] = useState(0);",
  "  return { count, setCount };",
  "}",
].join("\n");

const HOOK_BAD_ARROW_SRC = [
  "import { useContext } from 'react';",
  "import { AuthCtx } from './AuthCtx';",
  "export const fetchAuth = () => {",
  "  const ctx = useContext(AuthCtx);",
  "  return ctx;",
  "};",
].join("\n");

const namingHookPrefixAdapter: OracleAdapter = {
  ruleId: "naming/hook-prefix",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SIMPLE,
    "src/hooks/useCounter.ts": HOOK_CLEAN_SRC,
  }),
  mutations: [
    {
      name: "getCounter-calls-useState",
      apply: (f): FixtureFiles => ({ ...f, "src/hooks/useCounter.ts": HOOK_BAD_NAME_SRC }),
    },
    {
      name: "fetchAuth-calls-useContext",
      apply: (f): FixtureFiles => ({ ...f, "src/hooks/useCounter.ts": HOOK_BAD_ARROW_SRC }),
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// stories/coverage
// Fires when a component from componentInventory has no story.
// componentInventory is built from imports of the componentsModule (@acme/ui).
// storyIndex is loaded from *.stories.{ts,tsx,js,jsx} files in the repo.
//
// CRITICAL: the rule returns N/A when storyIndex is null (no story files found
// anywhere). So the mutation cannot simply remove the only story file — that
// would put the rule into N/A mode instead of finding a violation.
// Strategy: fixture has TWO components (Button + Card) both imported, stories
// exist for BOTH (clean). Mutation removes Button's story while keeping Card's
// story → storyIndex is non-null (Card story found) + Button has no story → fires.
// ---------------------------------------------------------------------------

const STORIES_APP_TSX = [
  'import { Button, Card } from "@acme/ui";',
  "export function App() {",
  "  return <div><Button>click</Button><Card /></div>;",
  "}",
].join("\n");

const BUTTON_STORY_TSX = [
  'import { Button } from "@acme/ui";',
  'export default { title: "Button", component: Button };',
  "export const Primary = {};",
].join("\n");

const CARD_STORY_TSX = [
  'import { Card } from "@acme/ui";',
  'export default { title: "Card", component: Card };',
  "export const Default = {};",
].join("\n");

const storiesCoverageAdapter: OracleAdapter = {
  ruleId: "stories/coverage",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_CONSUMER,
    "src/App.tsx": STORIES_APP_TSX,
    "src/Button.stories.tsx": BUTTON_STORY_TSX,
    "src/Card.stories.tsx": CARD_STORY_TSX,
  }),
  mutations: [
    {
      // Remove Button's story but keep Card's — storyIndex stays non-null,
      // Button enters componentInventory but has no byTitle entry → fires.
      name: "button-missing-story",
      apply: (f): FixtureFiles => {
        const next = { ...f };
        delete next["src/Button.stories.tsx"];
        return next;
      },
    },
  ],
  metamorphic: [],
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const componentAdapters: OracleAdapter[] = [
  svgViewboxAdapter,
  iconDecorativeAriaAdapter,
  noIconFontsAdapter,
  noNativeShadowsAdapter,
  docCommentsAdapter,
  namingPascalCaseAdapter,
  namingHookPrefixAdapter,
  storiesCoverageAdapter,
];
