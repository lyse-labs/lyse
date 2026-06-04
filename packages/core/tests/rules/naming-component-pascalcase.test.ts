import { describe, it, expect } from "vitest";
import { rule, countCompliantComponents } from "../../src/rules/naming-component-pascalcase.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const ctx: RuleContext = {
  repoRoot: "/r",
  tokens: null,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

function tsx(source: string, path = "src/MyComp.tsx"): ParsedFiles {
  return { ts: [{ path, source, imports: [], ast: null }], css: [], cssInJs: [] };
}

// ---------------------------------------------------------------------------
// Detection — flags non-PascalCase components
// ---------------------------------------------------------------------------
describe("rule naming/component-pascalcase — detection", () => {
  it("flags a camelCase exported function component", async () => {
    const source = `export function myButton() { return (<button>x</button>); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("myButton");
    expect(result.findings[0]!.suggestion).toContain("MyButton");
  });

  it("flags a snake_case exported const component", async () => {
    const source = `export const my_card = () => { return (<div>x</div>); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("my_card");
    expect(result.findings[0]!.suggestion).toContain("MyCard");
  });

  it("flags a camelCase component with displayName", async () => {
    const source = [
      "export const myWidget = () => { return null; }",
      "myWidget.displayName = 'MyWidget';",
    ].join("\n");
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("myWidget");
  });

  it("sets severity to 'warning'", async () => {
    const source = `export function badName() { return (<div />); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("sets ruleId correctly", async () => {
    const source = `export function notRight() { return (<span>x</span>); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings[0]!.ruleId).toBe("naming/component-pascalcase");
  });

  it("sets axis to 'components'", async () => {
    const source = `export function wrongCase() { return (<p>x</p>); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings[0]!.axis).toBe("components");
  });
});

// ---------------------------------------------------------------------------
// No false positives — should NOT flag correct patterns
// ---------------------------------------------------------------------------
describe("rule naming/component-pascalcase — no false positives", () => {
  it("does NOT flag PascalCase exported function component", async () => {
    const source = `export function MyButton() { return (<button>x</button>); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag PascalCase exported const component", async () => {
    const source = `export const MyCard = () => { return (<div>x</div>); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag HOC pattern (withRouter)", async () => {
    const source = `export function withRouter(Comp: any) { return (<Comp />); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hook functions (use* — handled by hook-prefix rule)", async () => {
    const source = `export function useMyHook() { return null; }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("skips test files (.test.tsx)", async () => {
    const source = `export function myHelper() { return (<div>x</div>); }`;
    const result = await rule.evaluate(ctx, tsx(source, "src/MyComp.test.tsx"));
    expect(result.findings).toHaveLength(0);
  });

  it("skips spec files (.spec.tsx)", async () => {
    const source = `export function renderWrapper() { return (<div>x</div>); }`;
    const result = await rule.evaluate(ctx, tsx(source, "src/MyComp.spec.tsx"));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT scan .ts files (only .tsx/.jsx)", async () => {
    const source = `export function notAComponent() { return null; }`;
    const parsed: ParsedFiles = {
      ts: [{ path: "src/utils.ts", source, imports: [], ast: null }],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag non-JSX returning functions", async () => {
    const source = `export function getData() { return fetch('/api'); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria (#154) — JSX-vs-generic disambiguation
// ---------------------------------------------------------------------------
describe("rule naming/component-pascalcase — #154 JSX evidence gate", () => {
  it("does NOT flag a factory whose nested function returns JSX (`dynamic<T>`)", async () => {
    const source =
      `export function dynamic<T>(loader) { return function Dyn(props) { return <Suspense/>; }; }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag a getter returning a plain object (`getUser`)", async () => {
    const source = `export function getUser(id) { return db.users.find(id); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT count `<T>` generic as JSX evidence (`useMemoize<T>`)", async () => {
    const source =
      `export function useMemoize<T>(fn: () => T) { return useMemo(fn, []); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("flags a real camelCase component returning JSX (`myButton`)", async () => {
    const source =
      `export function myButton(props) { return <button {...props} />; }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("myButton");
    expect(result.findings[0]!.suggestion).toContain("MyButton");
  });

  it("flags a camelCase component with JSX return inside a braced if-block (recall regression)", async () => {
    const source =
      `export function myButton(props) { if (props.disabled) { return <button disabled />; } return null; }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("myButton");
    expect(result.findings[0]!.suggestion).toContain("MyButton");
  });

  it("does not flag a camelCase factory followed by a JSX component in the same file", async () => {
    const source = `
      export function createClientForWorkspace() {
        return makeClient({ option: 1 });
      }
      export function MyComponent() {
        return <div />;
      }
    `;
    const result = await rule.evaluate(ctx, tsx(source));
    const flagged = result.findings.map((f) => f.message);
    expect(flagged.some((m) => m.includes("createClientForWorkspace"))).toBe(false);
  });

  it("inner factory-exported `Dyn` is PascalCase and the outer `dynamic` is not flagged", async () => {
    const source =
      `export function dynamic(loader) { return function Dyn(props) { return <Suspense/>; }; }`;
    const result = await rule.evaluate(ctx, tsx(source));
    const flagged = result.findings.map((f) => f.message);
    expect(flagged.some((m) => m.includes("dynamic"))).toBe(false);
    expect(flagged.some((m) => m.includes("Dyn"))).toBe(false);
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// #169 — implicit-return arrows, indirect JSX, object-of-JSX
// ---------------------------------------------------------------------------
describe("rule naming/component-pascalcase — #169 blind spots", () => {
  it("flags implicit-return arrow `export const myButton = (props) => <button/>`", async () => {
    const source = `export const myButton = (props) => <button {...props} />;`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("myButton");
    expect(result.findings[0]!.suggestion).toContain("MyButton");
  });

  it("does NOT flag implicit-return arrow returning non-JSX", async () => {
    const source = `export const formatLabel = (text: string) => text.toUpperCase();`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag indirect JSX via wrapper call — v0.1 limitation to avoid React Email / SSR / test helper FPs", async () => {
    const source = `export function renderEmailHtml() { return render(<MagicEmail />); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag indirect non-JSX wrapper call (`cache(() => fetchDeps())`)", async () => {
    const source = `export function getDeps() { return cache(() => fetchDeps()); }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag object-of-JSX factory (`getMdxComponents`)", async () => {
    const source = `export function getMdxComponents() { return { h1: ({children}) => <h1>{children}</h1> }; }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT regress PascalCase function returning JSX", async () => {
    const source = `export function MyComponent() { return <div />; }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT regress the #160 nested-function exclusion (`dynamic<T>`)", async () => {
    const source = `export function dynamic<T>(loader) { return function Dyn(props) { return <Suspense/>; }; }`;
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Path exclusion
// ---------------------------------------------------------------------------
describe("rule naming/component-pascalcase — excludePaths", () => {
  it("respects excludePaths", async () => {
    const ctxExclude: RuleContext = { ...ctx, excludePaths: ["vendor/**"] };
    const source = `export function myComp() { return (<div />); }`;
    const parsed: ParsedFiles = {
      ts: [
        { path: "vendor/lib.tsx", source, imports: [], ast: null },
        { path: "src/app.tsx",    source, imports: [], ast: null },
      ],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctxExclude, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.location.file).toBe("src/app.tsx");
  });
});

// ---------------------------------------------------------------------------
// Compliance counter
// ---------------------------------------------------------------------------
describe("countCompliantComponents", () => {
  it("counts PascalCase exported components", () => {
    const source = [
      "export function Button() { return null; }",
      "export const Card = () => null;",
      "export class Modal {}",
    ].join("\n");
    expect(countCompliantComponents(source)).toBeGreaterThanOrEqual(2);
  });

  it("does NOT count non-PascalCase names", () => {
    const source = `export function myButton() { return null; }`;
    expect(countCompliantComponents(source)).toBe(0);
  });

  it("counts multiple PascalCase names", () => {
    const source = [
      "export const Header = () => null;",
      "export const Footer = () => null;",
      "export const Sidebar = () => null;",
    ].join("\n");
    expect(countCompliantComponents(source)).toBe(3);
  });
});
