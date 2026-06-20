import { describe, it, expect } from "vitest";
import { rule, _internal } from "../../src/rules/components-doc-comments.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

function makeCtx(): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function tsFile(path: string, source: string): ParsedTsFile {
  return { path, ast: null, source, imports: [] };
}
function makeParsed(files: { path: string; source: string }[]): ParsedFiles {
  return { ts: files.map((f) => tsFile(f.path, f.source)), css: [], cssInJs: [] };
}
async function run(files: { path: string; source: string }[]) {
  return rule.evaluate(makeCtx(), makeParsed(files));
}

describe("rule components/doc-comments", () => {
  it("flags an exported function component with no doc comment", async () => {
    const r = await run([{ path: "Button.tsx", source: "export function Button() { return <button />; }" }]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("components/doc-comments");
    expect(r.findings[0]!.message).toContain("Button");
    expect(r.findings[0]!.severity).toBe("info");
    expect(r.opportunities).toBe(1);
  });

  it("does not flag a component with a leading JSDoc comment", async () => {
    const r = await run([{ path: "Button.tsx", source: "/** A button. */\nexport function Button() { return <button />; }" }]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(1);
  });

  it("flags an exported arrow-function component with no doc comment", async () => {
    const r = await run([{ path: "Card.tsx", source: "export const Card = () => <div />;" }]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("Card");
  });

  it("flags a forwardRef component with no doc comment (HOC pattern)", async () => {
    const r = await run([{ path: "Input.tsx", source: "export const Input = forwardRef((props, ref) => <input ref={ref} />);" }]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("Input");
  });

  it("does not flag a documented forwardRef component", async () => {
    const r = await run([{ path: "Input.tsx", source: "/** Text input. */\nexport const Input = React.forwardRef((props, ref) => <input ref={ref} />);" }]);
    expect(r.findings).toHaveLength(0);
  });

  it("flags a memo component with no doc comment", async () => {
    const r = await run([{ path: "List.tsx", source: "export const List = memo(() => <ul />);" }]);
    expect(r.findings).toHaveLength(1);
  });

  it("flags a default-exported function component with no doc comment", async () => {
    const r = await run([{ path: "Modal.tsx", source: "export default function Modal() { return <div />; }" }]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("Modal");
  });

  it("treats a plain block comment (not JSDoc) as undocumented", async () => {
    const r = await run([{ path: "Button.tsx", source: "/* internal */\nexport function Button() { return <button />; }" }]);
    expect(r.findings).toHaveLength(1);
  });

  it("does not flag non-component PascalCase exports (createContext, objects)", async () => {
    const r = await run([{ path: "ctx.tsx", source: "export const ButtonContext = createContext(null);\nexport const Theme = { color: 'red' };" }]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not flag non-Pascal exports (hooks, constants)", async () => {
    const r = await run([{ path: "u.tsx", source: "export function useThing() { return 1; }\nexport const DEFAULT_SIZE = 8;" }]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not flag re-exports (no local declaration)", async () => {
    const r = await run([{ path: "index.tsx", source: "export { Button } from './Button';" }]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not scan non-tsx/jsx files", async () => {
    const r = await run([{ path: "Button.ts", source: "export function Button() { return null; }" }]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("skips low-signal files (tests/stories/fixtures)", async () => {
    const r = await run([{ path: "Button.stories.tsx", source: "export function Demo() { return <button />; }" }]);
    expect(r.findings).toHaveLength(0);
  });

  it("reports N/A (zero opportunities) when there are no components", async () => {
    const r = await run([{ path: "util.tsx", source: "export const add = (a: number, b: number) => a + b;" }]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("counts both documented and undocumented components as opportunities", async () => {
    const r = await run([{ path: "two.tsx", source: "/** A. */\nexport function A() { return <i />; }\nexport function B() { return <i />; }" }]);
    expect(r.findings).toHaveLength(1);
    expect(r.opportunities).toBe(2);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.scanComponentDocs).toBe("function");
  });
});
