import type { OracleAdapter, FixtureFiles } from "../types.js";

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

// CRITICAL: stories/coverage returns N/A when storyIndex is null (no story
// files anywhere). Mutation cannot simply remove the only story — that would
// trigger N/A instead of a violation. Fixture has TWO components (Button + Card)
// with stories for both. Mutation removes Button's story while keeping Card's →
// storyIndex stays non-null + Button has no story → rule fires.
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
// contracts-strictness — adversarial corpus
// ---------------------------------------------------------------------------
//
// Rule flags three violation classes:
//   A: props typed `any`       → error
//   B: props typed `unknown`   → error
//   C: variant-like props (variant/size/intent/color/tone/appearance/kind)
//      typed plain `string` instead of a string-literal union → warning
//   D: publishable package.json missing `types`/`typings` field → warning
//
// False-friend classes (legitimate code that must NOT flag):
//   1. Variant props typed with proper string-literal unions
//   2. Non-variant string props (label, title, id, name, href, placeholder, …)
//   3. Private packages (private: true)
//   4. Non-publishable packages (no main/module/exports/types)
//   5. Framework-allowed props typed any (children/ref/key/as/asChild)
//   6. Non-PascalCase function exports with `any` params (utilities)
//   7. Test files (.test.tsx, .spec.tsx)
//   8. Components with no type annotation on params
//   9. Callback / function-type props
//  10. Inline object-pattern params without TSTypeAnnotation
//  11. Cross-file type references (skipped in v0.1)
//  12. Publishable packages WITH a valid `types` field
//  13. Non-component TSX files (no exported PascalCase component)

const PKG_PUB = JSON.stringify({
  name: "@acme/ui",
  version: "1.0.0",
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
});

const PKG_SIMPLE_CS = JSON.stringify({ name: "fx-cs", version: "1.0.0" });

// Clean fixture: a well-typed component + publishable package with types field.
// This is the negative baseline (must not flag).
const CS_CLEAN_TSX = [
  'type ButtonVariant = "primary" | "secondary" | "ghost";',
  "interface ButtonProps {",
  "  variant: ButtonVariant;",
  '  size: "sm" | "md" | "lg";',
  "  label: string;",
  "  onClick?: () => void;",
  "  children?: React.ReactNode;",
  "}",
  "export function Button(props: ButtonProps) { return <button />; }",
].join("\n");

const FALSE_FRIENDS_CS: FixtureFiles[] = [
  // ── CLASS 1: variant prop typed as proper string-literal union ─────────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Button.tsx":
      'type V = "primary" | "secondary" | "ghost"; interface P { variant: V; } export const Button = (p: P) => <button />;',
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Badge.tsx":
      'interface P { size: "sm" | "md" | "lg"; intent: "success" | "error" | "warning"; } export const Badge = (p: P) => <span />;',
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Tag.tsx":
      'type Intent = "positive" | "negative" | "neutral"; type Color = "blue" | "red" | "green"; interface P { intent: Intent; color: Color; } export const Tag = (p: P) => <span />;',
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Chip.tsx":
      'type Tone = "loud" | "muted"; type Appearance = "filled" | "outlined" | "ghost"; interface P { tone: Tone; appearance: Appearance; } export const Chip = (p: P) => <span />;',
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Pill.tsx":
      'type K = "action" | "status" | "filter"; interface P { kind: K; } export const Pill = (p: P) => <span />;',
  },
  // ── CLASS 2: non-variant string props ──────────────────────────────────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Input.tsx":
      "interface P { label: string; placeholder: string; id: string; } export const Input = (p: P) => <input />;",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Link.tsx":
      "interface P { href: string; title: string; rel?: string; } export const Link = (p: P) => <a href={p.href} />;",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Heading.tsx":
      "interface P { text: string; htmlFor?: string; ariaLabel?: string; } export const Heading = (p: P) => <h2>{p.text}</h2>;",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Avatar.tsx":
      "interface P { name: string; src: string; alt: string; } export const Avatar = (p: P) => <img src={p.src} alt={p.alt} />;",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Tooltip.tsx":
      "interface P { content: string; className?: string; } export const Tooltip = (p: P) => <div title={p.content} />;",
  },
  // ── CLASS 3: private packages ───────────────────────────────────────────────
  {
    "package.json": JSON.stringify({
      name: "design-system-internal",
      private: true,
      main: "./dist/index.js",
    }),
  },
  {
    "package.json": JSON.stringify({
      name: "@acme/private-ui",
      private: true,
      main: "./dist/index.js",
      module: "./dist/index.esm.js",
    }),
  },
  // ── CLASS 4: non-publishable packages ──────────────────────────────────────
  {
    "package.json": JSON.stringify({ name: "dev-app", scripts: { test: "vitest" } }),
  },
  {
    "package.json": JSON.stringify({ name: "monorepo-root", workspaces: ["packages/*"] }),
  },
  {
    "package.json": JSON.stringify({ name: "config-pkg", devDependencies: { typescript: "^5.0.0" } }),
  },
  // ── CLASS 5: framework-allowed props typed any ─────────────────────────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Slot.tsx":
      "interface P { children: any; ref: any; } export const Slot = (p: P) => <>{p.children}</>;",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Polymorphic.tsx":
      "interface P { as: any; asChild: any; key: any; } export const Polymorphic = (p: P) => <div />;",
  },
  // ── CLASS 6: non-PascalCase exports with any params ────────────────────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/utils.tsx":
      "interface P { data: any; } export function renderItem(p: P) { return <li>{p.data}</li>; }",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/helpers.tsx":
      "interface P { payload: unknown; } export const formatEntry = (p: P) => String(p.payload);",
  },
  // ── CLASS 7: test files ─────────────────────────────────────────────────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Button.test.tsx":
      "interface P { data: any; } export function TestBox(p: P) { return <div />; }",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Card.spec.tsx":
      "interface P { payload: unknown; } export function SpecCard(p: P) { return <div />; }",
  },
  // ── CLASS 8: component with no type annotation on params ───────────────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Divider.tsx": "export const Divider = () => <hr />;",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Spacer.tsx": "export function Spacer() { return <div />; }",
  },
  // ── CLASS 9: callback / function-type props ─────────────────────────────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Trigger.tsx":
      "interface P { onClick: () => void; onChange: (val: string) => void; } export const Trigger = (p: P) => <button onClick={p.onClick} />;",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Form.tsx":
      "interface P { onSubmit: (e: React.FormEvent) => void; onReset?: () => void; } export const Form = (p: P) => <form onSubmit={p.onSubmit} />;",
  },
  // ── CLASS 10: object-pattern params without TSTypeAnnotation ───────────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/Card.tsx":
      "export function Card({ title, body }: { title: string; body: string }) { return <div>{title}</div>; }",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/List.tsx":
      'export const List = ({ items }: { items: string[] }) => <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>;',
  },
  // ── CLASS 11: cross-file type reference (skipped by v0.1 scanner) ──────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/types.ts": 'export type ButtonProps = { variant: "primary" | "secondary"; size: "sm" | "lg"; };',
    "src/Button.tsx":
      'import type { ButtonProps } from "./types.js"; export const Button = (p: ButtonProps) => <button />;',
  },
  // ── CLASS 12: publishable package WITH valid types field ───────────────────
  {
    "package.json": PKG_PUB,
    "dist/index.d.ts": "export {};",
  },
  {
    "package.json": JSON.stringify({
      name: "@acme/tokens",
      version: "1.0.0",
      main: "./dist/index.js",
      typings: "./dist/index.d.ts",
    }),
    "dist/index.d.ts": "export const colors: Record<string, string>;",
  },
  // ── CLASS 13: non-component TSX (no exported PascalCase component) ──────────
  {
    "package.json": PKG_SIMPLE_CS,
    "src/constants.tsx":
      "export const defaultVariant: string = 'primary'; export const DEFAULT_SIZE: string = 'md';",
  },
  {
    "package.json": PKG_SIMPLE_CS,
    "src/icons/index.tsx":
      "import React from 'react'; export const arrowIcon = () => <svg viewBox='0 0 24 24'><path d='M0 0'/></svg>;",
  },
];

export const contractsStrictnessAdapter: OracleAdapter = {
  ruleId: "components/contracts-strictness",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_PUB,
    "dist/index.d.ts": "export {};",
    "src/Button.tsx": CS_CLEAN_TSX,
  }),
  mutations: [
    // ── CLASS A: any-typed props ─────────────────────────────────────────────
    {
      name: "any-prop-inline-type",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Box.tsx":
          "type P = { data: any }; export const Box = (p: P) => <div>{p.data}</div>;",
      }),
    },
    {
      name: "any-prop-interface",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Card.tsx":
          "interface CardProps { payload: any; } export function Card(props: CardProps) { return <div />; }",
      }),
    },
    {
      name: "any-prop-function-decl",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Panel.tsx":
          "interface P { content: any; } export function Panel(p: P) { return <section>{p.content}</section>; }",
      }),
    },
    {
      name: "any-prop-arrow-destructured",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Alert.tsx":
          "export const Alert = ({ message }: { message: any }) => <div role='alert'>{message}</div>;",
      }),
    },
    {
      name: "any-prop-export-default",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Modal.tsx":
          "interface ModalProps { body: any; footer: any; } export default function Modal(props: ModalProps) { return <dialog />; }",
      }),
    },
    {
      name: "multiple-any-props",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Table.tsx":
          "interface P { rows: any; columns: any; sort: any; } export const Table = (p: P) => <table />;",
      }),
    },
    {
      name: "any-on-icon-component",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Icon.tsx":
          "interface P { icon: any; } export const Icon = (p: P) => <svg viewBox='0 0 24 24'>{p.icon}</svg>;",
      }),
    },
    {
      name: "any-on-context-provider",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Provider.tsx":
          "interface P { value: any; } export const Provider = (p: P) => <div>{p.value}</div>;",
      }),
    },
    {
      name: "any-on-menu-item",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/MenuItem.tsx":
          "interface P { action: any; } export function MenuItem(p: P) { return <li>{p.action}</li>; }",
      }),
    },
    {
      name: "any-on-form-field",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Field.tsx":
          "interface P { control: any; error: any; } export const Field = (p: P) => <div />;",
      }),
    },
    {
      name: "any-mixed-with-typed",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Tabs.tsx":
          "interface P { label: string; selected: boolean; value: any; } export const Tab = (p: P) => <button>{p.label}</button>;",
      }),
    },
    {
      name: "any-on-skeleton",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Skeleton.tsx":
          "type P = { config: any }; export const Skeleton = (p: P) => <div aria-hidden />;",
      }),
    },
    // ── CLASS B: unknown-typed props ─────────────────────────────────────────
    {
      name: "unknown-prop-interface",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/DataGrid.tsx":
          "interface P { row: unknown; } export const DataGrid = (p: P) => <table />;",
      }),
    },
    {
      name: "unknown-prop-inline",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Tile.tsx":
          "type P = { metadata: unknown }; export const Tile = (p: P) => <article />;",
      }),
    },
    {
      name: "unknown-prop-function-decl",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Drawer.tsx":
          "interface P { config: unknown; } export function Drawer(p: P) { return <aside />; }",
      }),
    },
    {
      name: "multiple-unknown-props",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Widget.tsx":
          "interface P { state: unknown; dispatch: unknown; } export const Widget = (p: P) => <div />;",
      }),
    },
    {
      name: "unknown-mixed-with-any",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Container.tsx":
          "interface P { data: any; meta: unknown; } export const Container = (p: P) => <section />;",
      }),
    },
    {
      name: "unknown-on-dialog",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Dialog.tsx":
          "interface P { result: unknown; } export const Dialog = (p: P) => <dialog />;",
      }),
    },
    {
      name: "unknown-on-notification",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Toast.tsx":
          "type P = { payload: unknown }; export function Toast(p: P) { return <div role='status' />; }",
      }),
    },
    {
      name: "unknown-on-stepper",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Stepper.tsx":
          "interface P { step: unknown; } export const Stepper = (p: P) => <ol />;",
      }),
    },
    // ── CLASS C: variant-like props typed plain string ────────────────────────
    {
      name: "variant-string-button",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Btn.tsx":
          "interface P { variant: string; } export const Btn = (p: P) => <button />;",
      }),
    },
    {
      name: "size-string-badge",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Badge.tsx":
          "interface P { size: string; } export const Badge = (p: P) => <span />;",
      }),
    },
    {
      name: "intent-string-alert",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Alert.tsx":
          "interface P { intent: string; } export const Alert = (p: P) => <div role='alert' />;",
      }),
    },
    {
      name: "color-string-icon",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/IconWrap.tsx":
          "interface P { color: string; } export const IconWrap = (p: P) => <span style={{ color: p.color }} />;",
      }),
    },
    {
      name: "tone-string-text",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Text.tsx":
          "interface P { tone: string; } export const Text = (p: P) => <p />;",
      }),
    },
    {
      name: "appearance-string-chip",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Chip.tsx":
          "interface P { appearance: string; } export const Chip = (p: P) => <span />;",
      }),
    },
    {
      name: "kind-string-tag",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Tag.tsx":
          "interface P { kind: string; } export const Tag = (p: P) => <span />;",
      }),
    },
    {
      name: "variant-and-size-string",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Pill.tsx":
          "interface P { variant: string; size: string; } export const Pill = (p: P) => <span />;",
      }),
    },
    {
      name: "intent-string-toast",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Toast.tsx":
          "interface P { intent: string; } export function Toast(p: P) { return <div role='status' />; }",
      }),
    },
    {
      name: "color-and-tone-string",
      apply: (): FixtureFiles => ({
        "package.json": PKG_PUB,
        "dist/index.d.ts": "export {};",
        "src/Label.tsx":
          "interface P { color: string; tone: string; } export const Label = (p: P) => <label />;",
      }),
    },
    // ── CLASS D: publishable package.json missing types ───────────────────────
    {
      name: "missing-types-simple",
      apply: (): FixtureFiles => ({
        "package.json": JSON.stringify({ name: "@acme/core", version: "1.0.0", main: "./dist/index.js" }),
      }),
    },
    {
      name: "missing-types-with-module",
      apply: (): FixtureFiles => ({
        "package.json": JSON.stringify({
          name: "@acme/utils",
          version: "1.0.0",
          main: "./dist/index.cjs",
          module: "./dist/index.esm.js",
        }),
      }),
    },
    {
      name: "missing-types-with-exports",
      apply: (): FixtureFiles => ({
        "package.json": JSON.stringify({
          name: "@acme/icons",
          version: "1.0.0",
          exports: { ".": { import: "./dist/index.js" } },
        }),
      }),
    },
    {
      name: "types-points-to-missing-dist",
      apply: (): FixtureFiles => ({
        "package.json": JSON.stringify({
          name: "@acme/theme",
          version: "1.0.0",
          main: "./dist/index.js",
          types: "./dist/index.d.ts",
        }),
        // no dist/index.d.ts file written → file doesn't exist → rule flags it
      }),
    },
    {
      name: "missing-types-scoped-package",
      apply: (): FixtureFiles => ({
        "package.json": JSON.stringify({
          name: "@design-system/button",
          version: "2.1.0",
          main: "./dist/Button.js",
        }),
      }),
    },
  ],
  metamorphic: [],
  falseFriends: FALSE_FRIENDS_CS,
};

const noArbitraryTailwindAdapter: OracleAdapter = {
  ruleId: "components/no-arbitrary-tailwind",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SIMPLE,
    "src/Button.tsx": 'export const Button = () => <div className="p-4 text-sm rounded-md" />;',
  }),
  mutations: [
    {
      name: "arbitrary-spacing",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.tsx": 'export const Button = () => <div className="p-[12px]" />;',
      }),
    },
    {
      name: "arbitrary-font-size",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.tsx": 'export const Button = () => <div className="text-[14px]" />;',
      }),
    },
    {
      name: "arbitrary-width",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.tsx": 'export const Button = () => <div className="w-[37px]" />;',
      }),
    },
  ],
  metamorphic: [
    {
      // Two different non-color arbitrary values must both flag (same prefix, different value)
      name: "different-non-color-arbitrary-values-both-flag",
      a: {
        "package.json": PKG_SIMPLE,
        "src/T.tsx": 'export const T = () => <div className="p-[12px]" />;',
      },
      b: {
        "package.json": PKG_SIMPLE,
        "src/T.tsx": 'export const T = () => <div className="p-[0.75rem]" />;',
      },
      expectViolation: true,
    },
    {
      // Color bracket and var() bracket must BOTH be safe (not flagged)
      name: "color-bracket-and-var-bracket-both-clean",
      a: {
        "package.json": PKG_SIMPLE,
        "src/T.tsx": 'export const T = () => <div className="text-[#111]" />;',
      },
      b: {
        "package.json": PKG_SIMPLE,
        "src/T.tsx": 'export const T = () => <div className="w-[var(--sidebar)]" />;',
      },
      expectViolation: false,
    },
  ],
};

export const componentAdapters: OracleAdapter[] = [
  svgViewboxAdapter,
  iconDecorativeAriaAdapter,
  noIconFontsAdapter,
  noNativeShadowsAdapter,
  namingPascalCaseAdapter,
  namingHookPrefixAdapter,
  storiesCoverageAdapter,
  contractsStrictnessAdapter,
  noArbitraryTailwindAdapter,
];
