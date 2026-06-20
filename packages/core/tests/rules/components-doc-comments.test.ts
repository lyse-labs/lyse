import { describe, it, expect } from "vitest";
import { _internal } from "../../src/rules/components-doc-comments.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

function makeCtx(): RuleContext {
  return {
    repoRoot: "/r",
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}
function tsFile(path: string, source: string): ParsedTsFile {
  return { path, ast: null, source, imports: [] };
}
function makeParsed(files: { path: string; source: string }[]): ParsedFiles {
  return { ts: files.map((f) => tsFile(f.path, f.source)), css: [], cssInJs: [] };
}
// A root package ("" dir) owning the given public names — preserves the simple
// single-set behavior for the common-case tests.
function run(files: { path: string; source: string }[], pub: string[]) {
  const index = { packages: [{ dir: "", names: new Set(pub) }] };
  return _internal.evaluateDocComments(makeParsed(files), index, makeCtx());
}

describe("rule components/doc-comments — public-API re-scope", () => {
  it("flags a PUBLIC undocumented component", () => {
    const r = run(
      [{ path: "Button.tsx", source: "export function Button() { return <button />; }" }],
      ["Button"],
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("components/doc-comments");
    expect(r.findings[0]!.severity).toBe("info");
    expect(r.opportunities).toBe(1);
  });

  it("does NOT flag a documented public component", () => {
    const r = run(
      [
        {
          path: "Button.tsx",
          source: "/** A button. */\nexport function Button() { return <button />; }",
        },
      ],
      ["Button"],
    );
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(1);
  });

  it("does NOT flag an internal (non-public) component, nor count it", () => {
    const r = run(
      [{ path: "Internal.tsx", source: "export function InternalThing() { return <i />; }" }],
      ["Button"],
    );
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("empty public set → N/A (0 findings, 0 opportunities) even with undocumented components", () => {
    const r = run(
      [{ path: "Button.tsx", source: "export function Button() { return <button />; }" }],
      [],
    );
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("counts documented + undocumented public components as opportunities", () => {
    const r = run(
      [
        {
          path: "two.tsx",
          source:
            "/** A. */\nexport function Alpha() { return <i />; }\nexport function Bravo() { return <i />; }",
        },
      ],
      ["Alpha", "Bravo"],
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("Bravo");
    expect(r.opportunities).toBe(2);
  });

  it("skips low-signal files even for public names", () => {
    const r = run(
      [{ path: "Button.stories.tsx", source: "export function Button() { return <button />; }" }],
      ["Button"],
    );
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes the pure seam and the scanner", () => {
    expect(typeof _internal.evaluateDocComments).toBe("function");
    expect(typeof _internal.scanComponentDocs).toBe("function");
  });

  it("does NOT flag a demo component in a package that does not export it [corpus FP: radix apps/ssr-testing]", () => {
    // packages/ui publicly exports Button; apps/demo declares its own demo Button
    // but exports nothing. The demo Button must NOT be flagged via cross-package
    // name collision (the union-scoping bug found on radix).
    const index = {
      packages: [
        { dir: "packages/ui", names: new Set(["Button"]) },
        { dir: "apps/demo", names: new Set<string>() },
      ],
    };
    const files = makeParsed([
      { path: "packages/ui/src/Button.tsx", source: "export function Button() { return <button />; }" },
      { path: "apps/demo/app/Button.tsx", source: "export function Button() { return <button />; }" },
    ]);
    const r = _internal.evaluateDocComments(files, index, makeCtx());
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.location.file).toBe("packages/ui/src/Button.tsx");
    expect(r.opportunities).toBe(1);
  });
});
