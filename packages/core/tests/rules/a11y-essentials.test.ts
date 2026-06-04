import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/a11y-essentials.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const ctx: RuleContext = {
  repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [],
};

describe("rule a11y/essentials", () => {
  it("flags <img> without alt", async () => {
    const parsed: ParsedFiles = {
      ts: [{ path: "x.tsx", source: 'export default () => <img src="/x.png" />;', imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.some((f) => f.message.toLowerCase().includes("alt"))).toBe(true);
  });

  it("does not flag <img> with alt", async () => {
    const parsed: ParsedFiles = {
      ts: [{ path: "x.tsx", source: 'export default () => <img src="/x.png" alt="ok" />;', imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBe(0);
  });

  it("lints .tsx with TS syntax (interface + generic) and emits a11y findings (#167)", async () => {
    // With @typescript-eslint/parser, the linter now parses TS syntax and
    // reaches the jsx-a11y rules. A <button> without accessible name should
    // trip role-has-required-aria-props OR another a11y rule depending on
    // the plugin version — we assert ≥1 finding to keep the test stable.
    const tsxSrc = `
interface Props { onClick: () => void }
export default function Btn<T>(p: Props) {
  return <img src="/x.png" />;
}
`;
    const parsed: ParsedFiles = {
      ts: [{ path: "Btn.tsx", source: tsxSrc, imports: [], ast: {} }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.parseErrors).toBeUndefined();
    expect(result.opportunities).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.message.toLowerCase().includes("alt"))).toBe(true);
  });

  it("parses .tsx with generic arrow + zero a11y opportunities cleanly (#167 AC)", async () => {
    const tsxSrc = `const id = <T,>(x: T): T => x;\nexport default id;\n`;
    const parsed: ParsedFiles = {
      ts: [{ path: "id.tsx", source: tsxSrc, imports: [], ast: {} }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.parseErrors).toBeUndefined();
    expect(result.findings.length).toBe(0);
    expect(result.opportunities).toBe(0);
  });

  it("counts opportunities normally on clean JSX", async () => {
    const parsed: ParsedFiles = {
      ts: [{ path: "ok.jsx", source: 'export default () => <button>ok</button>;', imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.parseErrors).toBeUndefined();
    expect(result.opportunities).toBeGreaterThan(0);
  });

  it("does not double-count files where SWC failed (f.ast === null) as parseErrors (I1)", async () => {
    // The pipeline already surfaces SWC parse failures via `parseErrorCount` on
    // stderr. The rule must NOT re-report them as `coverage.parseErrors` — that
    // would be I1 double counting. We pass content that espree also cannot parse
    // so this exercises the suppression path.
    const parsed: ParsedFiles = {
      ts: [{ path: "broken.tsx", source: "this is { not valid", imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.parseErrors).toBeUndefined();
    expect(result.findings.length).toBe(0);
  });
});
