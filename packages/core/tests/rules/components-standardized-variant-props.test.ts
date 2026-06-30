import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/components-standardized-variant-props.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const CTX: RuleContext = {
  repoRoot: "/r",
  tokens: null,
  componentsModule: "@acme/ui",
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

// The rule reads only file.source, so ast can be a placeholder.
function tsFiles(...sources: string[]): ParsedFiles {
  return {
    ts: sources.map((source, i) => ({ path: `src/C${i}.tsx`, ast: null, source, imports: [] })),
    css: [],
    cssInJs: [],
  };
}

describe("rule components/standardized-variant-props", () => {
  it("flags a component with two or more style-modifier booleans", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { primary?: boolean; danger?: boolean; ghost?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings.length).toBe(1);
    expect(res.findings[0]!.message).toContain("Button");
  });

  it("does NOT flag a single style-modifier boolean", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { primary?: boolean; disabled?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag a proper variant union plus a generic boolean", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { variant?: "primary" | "danger" | "ghost"; disabled?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag generic state booleans", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { disabled?: boolean; loading?: boolean; fullWidth?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT count a style-modifier name that is not boolean", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { primary?: "a" | "b"; danger?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings).toHaveLength(0);
  });

  it("counts opportunities as components inspected and reports 0 findings on clean input", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface CardProps { elevated?: boolean }
export function Card(props: CardProps) { return <div />; }`
    ));
    expect(res.opportunities).toBe(1);
    expect(res.findings).toHaveLength(0);
  });
});
