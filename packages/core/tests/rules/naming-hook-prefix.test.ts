import { describe, it, expect } from "vitest";
import { rule, countCompliantHooks } from "../../src/rules/naming-hook-prefix.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const ctx: RuleContext = {
  repoRoot: "/r",
  tokens: null,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

function ts(source: string, path = "src/hooks.ts"): ParsedFiles {
  return { ts: [{ path, source, imports: [], ast: null }], css: [], cssInJs: [] };
}

function tsx(source: string, path = "src/hooks.tsx"): ParsedFiles {
  return { ts: [{ path, source, imports: [], ast: null }], css: [], cssInJs: [] };
}

// ---------------------------------------------------------------------------
// Detection — flags functions that call hooks but don't start with use + uppercase
// ---------------------------------------------------------------------------
describe("rule naming/hook-prefix — detection", () => {
  it("flags an exported function that calls useState but doesn't start with use", async () => {
    const source = [
      "import { useState } from 'react';",
      "export function getMyData() {",
      "  const [data, setData] = useState(null);",
      "  return data;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.message.includes("getMyData"))).toBe(true);
  });

  it("does not flag a create* factory that calls a hook while building its result [corpus FP]", async () => {
    const source = [
      "import { useState } from 'react';",
      "export function createStyles() {",
      "  const [theme] = useState(null);",
      "  return { theme };",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source, "src/create-styles.ts"));
    expect(result.findings).toHaveLength(0);
  });

  it("flags an exported const arrow function that calls useEffect", async () => {
    const source = [
      "import { useState, useEffect } from 'react';",
      "export const fetchUserData = () => {",
      "  const [user, setUser] = useState(null);",
      "  useEffect(() => {}, []);",
      "  return user;",
      "};",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings.some((f) => f.message.includes("fetchUserData"))).toBe(true);
  });

  it("suggests the correct use-prefixed name", async () => {
    const source = [
      "export function getCounter() {",
      "  const [count] = useState(0);",
      "  return count;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source));
    const finding = result.findings.find((f) => f.message.includes("getCounter"));
    expect(finding?.suggestion).toContain("useGetCounter");
  });

  it("sets severity to 'warning'", async () => {
    const source = `export function getData() { const x = useState(0); return x; }`;
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("sets ruleId correctly", async () => {
    const source = `export function fetchData() { const x = useMemo(() => 1, []); return x; }`;
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings[0]!.ruleId).toBe("naming/hook-prefix");
  });

  it("sets axis to 'components'", async () => {
    const source = `export function loadStuff() { const x = useRef(null); return x; }`;
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings[0]!.axis).toBe("components");
  });
});

// ---------------------------------------------------------------------------
// No false positives — should NOT flag correct patterns
// ---------------------------------------------------------------------------
describe("rule naming/hook-prefix — no false positives", () => {
  it("does NOT flag a correctly named hook (useMyData)", async () => {
    const source = [
      "export function useMyData() {",
      "  const [data, setData] = useState(null);",
      "  return data;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings.filter((f) => f.message.includes("useMyData"))).toHaveLength(0);
  });

  it("does NOT flag useCallback, useContext named hooks", async () => {
    const source = [
      "export function useAuth() {",
      "  const ctx = useContext(AuthContext);",
      "  return ctx;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag PascalCase components that use hooks", async () => {
    const source = [
      "export function MyButton() {",
      "  const [active, setActive] = useState(false);",
      "  return (<button />);",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, tsx(source));
    expect(result.findings.filter((f) => f.ruleId === "naming/hook-prefix")).toHaveLength(0);
  });

  it("does NOT flag utility functions that don't call hooks", async () => {
    const source = `export function getFormattedDate(d: Date) { return d.toISOString(); }`;
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings).toHaveLength(0);
  });

  it("skips test files (.test.ts)", async () => {
    const source = [
      "export function renderTestHook() {",
      "  const [x] = useState(0);",
      "  return x;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source, "src/hooks.test.ts"));
    expect(result.findings).toHaveLength(0);
  });

  it("skips spec files (.spec.tsx)", async () => {
    const source = `export function mountWith() { const x = useState(0); return x; }`;
    const result = await rule.evaluate(ctx, ts(source, "src/hooks.spec.tsx"));
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Path exclusion
// ---------------------------------------------------------------------------
describe("rule naming/hook-prefix — excludePaths", () => {
  it("respects excludePaths", async () => {
    const ctxExclude: RuleContext = { ...ctx, excludePaths: ["vendor/**"] };
    const source = `export function getData() { const x = useState(0); return x; }`;
    const parsed: ParsedFiles = {
      ts: [
        { path: "vendor/lib.ts",  source, imports: [], ast: null },
        { path: "src/hooks.ts",   source, imports: [], ast: null },
      ],
      css: [],
      cssInJs: [],
    };
    const result = await rule.evaluate(ctxExclude, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.location.file).toBe("src/hooks.ts");
  });
});

// ---------------------------------------------------------------------------
// Evidence-gated detection (issue #153)
// ---------------------------------------------------------------------------
describe("rule naming/hook-prefix — evidence-gated (issue #153)", () => {
  it("does NOT flag a pure utility (`flattenTree`) in a .tsx file", async () => {
    const source = `export function flattenTree(t: any) { return t.flat(); }`;
    const result = await rule.evaluate(ctx, tsx(source, "src/utils/tree.tsx"));
    expect(result.findings).toHaveLength(0);
  });

  it("flags `userStats` that calls `useUserData` internally", async () => {
    const source = [
      "export function userStats(id: string) {",
      "  const data = useUserData(id);",
      "  return data.count;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.suggestion).toContain("useUserStats");
  });

  it("flags `toggle` exported from apps/foo/src/hooks/use-toggle.ts (file-based evidence)", async () => {
    const source = `export function toggle() { return !state; }`;
    const result = await rule.evaluate(
      ctx,
      ts(source, "apps/foo/src/hooks/use-toggle.ts"),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("toggle");
  });

  it("flags a function whose first hook call sits past the legacy 2000-char cutoff", async () => {
    const filler = "  const x = 1;\n".repeat(200); // >2000 chars
    const source = [
      "export function bigHook(id: string) {",
      filler,
      "  const data = useUserData(id);",
      "  return data;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("bigHook");
  });

  it("does NOT flag a function whose only `use*(` call is on a member object (`ctx.useStore`)", async () => {
    const source = `export function readState(ctx: any) { return ctx.useStore(s => s.x); }`;
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag a camelCase utility followed by a real hook in the same file", async () => {
    const source = `
      export function utilityFn(x) {
        return x.toUpperCase();
      }
      export function useThing() {
        useEffect(() => {}, []);
        return null;
      }
    `;
    const result = await rule.evaluate(ctx, ts(source));
    const flagged = result.findings.map((f) => f.message);
    expect(flagged.some((m) => m.includes("utilityFn"))).toBe(false);
  });

  it("does NOT flag co-located helpers in a use-X.ts file (issue #166)", async () => {
    // `composeRefs` is an unrelated utility co-located with `useCombineRef`.
    // Path-evidence should NOT fire — the function name does not match the
    // filename's advertised target (`combineRef`).
    const source = [
      "export function composeRefs(...refs: any[]) { return refs; }",
      "export function useCombineRef() { return null; }",
    ].join("\n");
    const result = await rule.evaluate(
      ctx,
      ts(source, "apps/foo/src/hooks/use-combine-ref.ts"),
    );
    expect(result.findings).toHaveLength(0);
  });

  it("still flags `toggle` via body-evidence even when filename matches (issue #166)", async () => {
    const source = [
      "import { useState } from 'react';",
      "export function toggle() {",
      "  const [v, setV] = useState(false);",
      "  return v;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(
      ctx,
      ts(source, "apps/foo/src/hooks/use-toggle.ts"),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("toggle");
  });

  it("does NOT flag a function whose only `use*(` call lives in a nested inner function", async () => {
    const source = [
      "export function makeCb() {",
      "  function inner() { useEffect(() => {}, []); }",
      "  return inner;",
      "}",
    ].join("\n");
    const result = await rule.evaluate(ctx, ts(source));
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Compliance counter
// ---------------------------------------------------------------------------
describe("countCompliantHooks", () => {
  it("counts correctly named hooks (use + uppercase)", () => {
    const source = [
      "export function useMyData() {}",
      "export const useCounter = () => {};",
      "export const useAuth = () => {};",
    ].join("\n");
    expect(countCompliantHooks(source)).toBe(3);
  });

  it("does NOT count non-use-prefixed exports", () => {
    const source = `export function getData() {}`;
    expect(countCompliantHooks(source)).toBe(0);
  });

  it("does NOT count hooks starting with useLowercase (non-standard)", () => {
    // usemyData is NOT a valid hook (use + lowercase)
    const source = `export function usemydata() {}`;
    expect(countCompliantHooks(source)).toBe(0);
  });
});
