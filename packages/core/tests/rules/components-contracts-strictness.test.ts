import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/components-contracts-strictness.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const baseCtx = (repoRoot = "/r"): RuleContext => ({
  repoRoot,
  tokens: null,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
});

function tsx(source: string, path = "src/Button.tsx"): ParsedFiles {
  return { ts: [{ path, source, imports: [], ast: null }], css: [], cssInJs: [] };
}

const noFiles: ParsedFiles = { ts: [], css: [], cssInJs: [] };

// ---------------------------------------------------------------------------
// Fixture 1 — strict-radix-style (all variant unions, all props typed)
// ---------------------------------------------------------------------------
describe("rule components/contracts-strictness — fixture 1: strict (radix-style)", () => {
  const source = `
    type ButtonVariant = "primary" | "secondary" | "ghost";
    interface ButtonProps {
      variant: ButtonVariant;
      size: "sm" | "md" | "lg";
      onClick?: () => void;
      children: React.ReactNode;
    }
    export function Button(props: ButtonProps) { return <button />; }
  `;

  it("produces NO findings on a strict component", async () => {
    const result = await rule.evaluate(baseCtx(), tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("counts the component as an opportunity (denominator for scoring)", async () => {
    const result = await rule.evaluate(baseCtx(), tsx(source));
    expect(result.opportunities).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Fixture 2 — loose-any (any + unknown props → error each)
// ---------------------------------------------------------------------------
describe("rule components/contracts-strictness — fixture 2: loose-any", () => {
  const source = `
    interface BadProps {
      data: any;
      payload: unknown;
    }
    export function Box(props: BadProps) { return <div />; }
  `;

  it("flags `any` props as error", async () => {
    const result = await rule.evaluate(baseCtx(), tsx(source));
    const anyFinding = result.findings.find((f) => f.message.includes("'any'"));
    expect(anyFinding).toBeDefined();
    expect(anyFinding!.severity).toBe("error");
    expect(anyFinding!.ruleId).toBe("components/contracts-strictness");
    expect(anyFinding!.axis).toBe("components");
  });

  it("flags `unknown` props as error", async () => {
    const result = await rule.evaluate(baseCtx(), tsx(source));
    const unknownFinding = result.findings.find((f) => f.message.includes("'unknown'"));
    expect(unknownFinding).toBeDefined();
    expect(unknownFinding!.severity).toBe("error");
  });

  it("produces exactly 2 findings on this fixture (1 per prop)", async () => {
    const result = await rule.evaluate(baseCtx(), tsx(source));
    expect(result.findings).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Fixture 3 — missing-dts (package.json without types/typings)
// ---------------------------------------------------------------------------
describe("rule components/contracts-strictness — fixture 3: missing-dts", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "lyse-contracts-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "@acme/ui", main: "./dist/index.js" }),
      "utf8",
    );
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("flags package.json missing `types`/`typings` as warning", async () => {
    const result = await rule.evaluate(baseCtx(dir), noFiles);
    const finding = result.findings.find((f) => f.message.includes("missing"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("warning");
    expect(finding!.location.file).toContain("package.json");
  });

  it("does NOT flag a private package.json", async () => {
    const privateDir = mkdtempSync(join(tmpdir(), "lyse-contracts-private-"));
    try {
      writeFileSync(
        join(privateDir, "package.json"),
        JSON.stringify({ name: "private-pkg", private: true, main: "./dist/index.js" }),
        "utf8",
      );
      const result = await rule.evaluate(baseCtx(privateDir), noFiles);
      expect(result.findings).toHaveLength(0);
    } finally {
      rmSync(privateDir, { recursive: true, force: true });
    }
  });

  it("does NOT flag a non-publishable package.json (no main/module/exports/types)", async () => {
    const nonPubDir = mkdtempSync(join(tmpdir(), "lyse-contracts-nonpub-"));
    try {
      writeFileSync(
        join(nonPubDir, "package.json"),
        JSON.stringify({ name: "scratch", scripts: { test: "vitest" } }),
        "utf8",
      );
      const result = await rule.evaluate(baseCtx(nonPubDir), noFiles);
      expect(result.findings).toHaveLength(0);
    } finally {
      rmSync(nonPubDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Fixture 4 — string-variant (variant typed string, not union)
// ---------------------------------------------------------------------------
describe("rule components/contracts-strictness — fixture 4: string-variant", () => {
  const source = `
    interface CardProps {
      variant: string;
      size: string;
      label: string;
    }
    export function Card(props: CardProps) { return <div />; }
  `;

  it("flags `variant: string` as warning", async () => {
    const result = await rule.evaluate(baseCtx(), tsx(source, "src/Card.tsx"));
    const variantFinding = result.findings.find((f) => f.message.includes(".variant'"));
    expect(variantFinding).toBeDefined();
    expect(variantFinding!.severity).toBe("warning");
    expect(variantFinding!.message).toContain("union");
  });

  it("flags `size: string` as warning (size matches the variant heuristic)", async () => {
    const result = await rule.evaluate(baseCtx(), tsx(source, "src/Card.tsx"));
    const sizeFinding = result.findings.find((f) => f.message.includes(".size'"));
    expect(sizeFinding).toBeDefined();
    expect(sizeFinding!.severity).toBe("warning");
  });

  it("does NOT flag non-variant string props (e.g. `label`)", async () => {
    const result = await rule.evaluate(baseCtx(), tsx(source, "src/Card.tsx"));
    const labelFinding = result.findings.find((f) => f.message.includes(".label'"));
    expect(labelFinding).toBeUndefined();
  });

  it("variant union (string-literal union) is NOT flagged", async () => {
    const goodSource = `
      interface GoodProps { variant: "primary" | "secondary"; }
      export function Btn(props: GoodProps) { return <button />; }
    `;
    const result = await rule.evaluate(baseCtx(), tsx(goodSource));
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture 5 — mixed (any + string-variant + missing-dts all at once)
// ---------------------------------------------------------------------------
describe("rule components/contracts-strictness — fixture 5: mixed", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "lyse-contracts-mixed-"));
    mkdirSync(join(dir, "packages", "ui"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "ui", "package.json"),
      JSON.stringify({ name: "@acme/ui", main: "./dist/index.js" }),
      "utf8",
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", private: true }),
      "utf8",
    );
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const source = `
    interface MixedProps {
      variant: string;
      data: any;
      onClick?: () => void;
    }
    export function Mixed(props: MixedProps) { return <button />; }
  `;

  it("emits findings of multiple severities together", async () => {
    const result = await rule.evaluate(baseCtx(dir), tsx(source, "packages/ui/src/Mixed.tsx"));
    const severities = result.findings.map((f) => f.severity);
    expect(severities).toContain("error");
    expect(severities).toContain("warning");
  });

  it("warns on the workspace package.json missing types (root private is skipped)", async () => {
    const result = await rule.evaluate(baseCtx(dir), tsx(source, "packages/ui/src/Mixed.tsx"));
    const pkgFindings = result.findings.filter((f) => f.location.file.endsWith("package.json"));
    expect(pkgFindings).toHaveLength(1);
    expect(pkgFindings[0]!.location.file).toContain("packages/ui");
  });
});

// ---------------------------------------------------------------------------
// Fixture 6 — allowlist + suppression
// ---------------------------------------------------------------------------
describe("rule components/contracts-strictness — fixture 6: allowlist / framework-allowed", () => {
  it("does NOT flag framework-allowed prop names (children, ref, key, as, asChild)", async () => {
    const source = `
      interface AllowedProps {
        children: any;
        ref: any;
        key: any;
        as: any;
        asChild: any;
      }
      export function Box(props: AllowedProps) { return <div />; }
    `;
    const result = await rule.evaluate(baseCtx(), tsx(source));
    expect(result.findings).toHaveLength(0);
  });

  it("respects excludePaths", async () => {
    const ctx: RuleContext = { ...baseCtx(), excludePaths: ["vendor/**"] };
    const source = `
      interface P { data: any; }
      export function X(props: P) { return <div />; }
    `;
    const result = await rule.evaluate(ctx, tsx(source, "vendor/X.tsx"));
    expect(result.findings).toHaveLength(0);
  });

  it("skips test files (.test.tsx)", async () => {
    const source = `
      interface P { data: any; }
      export function TestComp(props: P) { return <div />; }
    `;
    const result = await rule.evaluate(baseCtx(), tsx(source, "src/Comp.test.tsx"));
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// types-points-to-missing-file (post-build verification)
// ---------------------------------------------------------------------------
describe("rule components/contracts-strictness — types points to missing file", () => {
  it("flags package.json whose `types` field points at a non-existent file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-contracts-broken-types-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "@acme/ui",
          main: "./dist/index.js",
          types: "./dist/index.d.ts",
        }),
        "utf8",
      );
      const result = await rule.evaluate(baseCtx(dir), noFiles);
      const f = result.findings.find((x) => x.message.includes("does not exist"));
      expect(f).toBeDefined();
      expect(f!.severity).toBe("warning");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does NOT flag a package.json whose `types` points at a file that exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-contracts-ok-types-"));
    try {
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "dist", "index.d.ts"), "export {};", "utf8");
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "@acme/ui",
          main: "./dist/index.js",
          types: "./dist/index.d.ts",
        }),
        "utf8",
      );
      const result = await rule.evaluate(baseCtx(dir), noFiles);
      const pkgFindings = result.findings.filter((f) => f.location.file.endsWith("package.json"));
      expect(pkgFindings).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts `typings` as an alias for `types`", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-contracts-typings-"));
    try {
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "dist", "index.d.ts"), "export {};", "utf8");
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "@acme/ui",
          main: "./dist/index.js",
          typings: "./dist/index.d.ts",
        }),
        "utf8",
      );
      const result = await rule.evaluate(baseCtx(dir), noFiles);
      const pkgFindings = result.findings.filter((f) => f.location.file.endsWith("package.json"));
      expect(pkgFindings).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Identity / shape checks
// ---------------------------------------------------------------------------
describe("rule components/contracts-strictness — identity", () => {
  it("sets ruleId and axis correctly", async () => {
    const source = `
      interface P { data: any; }
      export function X(props: P) { return <div />; }
    `;
    const result = await rule.evaluate(baseCtx(), tsx(source));
    expect(result.findings[0]!.ruleId).toBe("components/contracts-strictness");
    expect(result.findings[0]!.axis).toBe("components");
  });

  it("VARIANT_PROP_RE matches the heuristic prop names case-insensitively, but excludes `type`", () => {
    for (const name of ["variant", "Size", "INTENT", "color", "tone", "appearance", "kind"]) {
      expect(_internal.VARIANT_PROP_RE.test(name)).toBe(true);
    }
    // `type` is intentionally excluded — overwhelmingly used as HTML passthrough
    // (`<input type>`, `<button type>`) or as a discriminated-union tag, not as
    // a DS variant. Including it caused false positives on legitimate components.
    for (const name of ["label", "title", "onClick", "id", "type", "Type"]) {
      expect(_internal.VARIANT_PROP_RE.test(name)).toBe(false);
    }
  });

  it("framework-allowed prop set covers the documented names", () => {
    for (const name of ["children", "ref", "key", "as", "asChild"]) {
      expect(_internal.FRAMEWORK_ALLOWED_PROPS.has(name)).toBe(true);
    }
  });

  it("scanComponentContracts skips non-component (non-PascalCase) exports", () => {
    const source = `
      interface HelperProps { data: any; }
      export function helper(props: HelperProps) { return null; }
    `;
    const { findings } = _internal.scanComponentContracts(source);
    expect(findings).toHaveLength(0);
  });

  it("scanComponentContracts resolves a same-file interface reference", () => {
    const source = `
      interface ButtonProps { data: any; }
      export function Button(props: ButtonProps) { return <button />; }
    `;
    const { findings, componentCount } = _internal.scanComponentContracts(source);
    expect(componentCount).toBe(1);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe("any");
  });
});
