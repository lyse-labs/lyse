import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/a11y-semantic-html.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(ts: { path: string; source: string }[]): ParsedFiles {
  return { ts: ts.map((f): ParsedTsFile => ({ path: f.path, ast: null, source: f.source, imports: [] })), css: [], cssInJs: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-semhtml-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule a11y/semantic-html", () => {
  it("flags a <div> with onClick and no role", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => <div onClick={go}>x</div>;" }]));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("a11y/semantic-html");
  });

  it("flags <span> and <li> with onClick too", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => (<ul><li onClick={a}>a</li><span onClick={b}>b</span></ul>);" }]));
    expect(r.findings).toHaveLength(2);
  });

  it("does not flag a native <button> with onClick", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => <button onClick={go}>x</button>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag an anchor with onClick", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => <a href=\"#\" onClick={go}>x</a>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag a <div> that has role and onClick (explicit semantics)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => <div role=\"button\" tabIndex={0} onClick={go} onKeyDown={k}>x</div>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag a custom PascalCase component with onClick (it is a prop, not an element)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => <Card onClick={go}>x</Card>;" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not flag a plain <div> with no handler", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => <div className=\"box\">x</div>;" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("counts a static element with onClick as an opportunity even when compliant", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => <div role=\"button\" tabIndex={0} onClick={go} onKeyDown={k}>x</div>;" }]));
    expect(r.opportunities).toBe(1);
  });

  it("does not scan non-tsx/jsx files", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.ts", source: "const x = { onClick: 1 };" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("skips low-signal files (tests/stories)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.stories.tsx", source: "export const S = () => <div onClick={go}>x</div>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag a static element that forwards props via spread (role may come from props)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = (props) => <div onClick={go} {...props}>x</div>;" }]));
    expect(r.findings).toHaveLength(0);
  });

  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable a11y/semantic-html\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed([{ path: "M.tsx", source: "export const M = () => <div onClick={go}>x</div>;" }]));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.scanStaticInteractive).toBe("function");
    expect(typeof _internal.isAllowlisted).toBe("function");
  });
});
