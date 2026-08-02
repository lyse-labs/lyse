import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";

/**
 * The oracle: claims Lyse must never make, whatever the code does next.
 *
 * These are not locked values (see scoring-contract.test.ts for those). Each
 * case here encodes a statement that was, at some point, actually published by
 * a release and was false. A characterization test tells you the number moved;
 * an oracle tells you the number is wrong. Only the second kind can drive an
 * unattended fix-and-rerun loop, because only the second kind knows what
 * "correct" means without a human reading the diff.
 *
 * Add a case whenever a real audit is caught asserting something untrue.
 */

let root: string;
const audits = new Map<string, Awaited<ReturnType<typeof auditDirectory>>>();

function repo(name: string, files: Record<string, string>): string {
  const dir = join(root, name);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, contents);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function audit(dir: string) {
  const cached = audits.get(dir);
  if (cached) return cached;
  const result = await auditDirectory(dir, {});
  audits.set(dir, result);
  return result;
}

/** 40 components that do nothing, each with one unlabelled button. */
function stubComponents(): Record<string, string> {
  const files: Record<string, string> = {};
  for (let i = 1; i <= 40; i++) {
    files[`src/components/C${i}.tsx`] =
      `export function C${i}(){ return <button onClick={()=>{}}>x</button>; }\n`;
  }
  return files;
}

/** 40 colour tokens no component references. */
function orphanTokens(): string {
  const color: Record<string, { $value: string; $type: string }> = {};
  for (let i = 0; i < 40; i++) {
    color[`c${i}`] = { $value: `#${String(i).padStart(6, "0")}`, $type: "color" };
  }
  return JSON.stringify({ color }, null, 2);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "lyse-oracle-"));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("a repo with no design-system substance is never graded well", () => {
  // Shipped as 100 / grade A / tier "Autonomous" until the ai-governance
  // denominator stopped counting repos that have no AI at all.
  it("does not grade 40 stub components and 40 unused tokens as an A", async () => {
    const dir = repo("stub-ds", {
      "package.json": JSON.stringify({ name: "stub-ds", version: "1.0.0" }),
      "tokens/design.tokens.json": orphanTokens(),
      ...stubComponents(),
    });
    const { result } = await audit(dir);
    expect(result.grade?.grade).not.toBe("A");
    if (typeof result.finalScore === "number") expect(result.finalScore).toBeLessThan(80);
  });

  it("abstains on an empty repository rather than inventing a number", async () => {
    const dir = repo("empty-repo", { ".gitkeep": "" });
    const { result } = await audit(dir);
    expect(result.finalScore).toBe("N/A");
    for (const axis of result.axes) expect(axis.score).toBe("N/A");
  });
});

describe("an axis never claims to have measured what it did not", () => {
  it("does not activate ai-governance on a repo with no AI surface", async () => {
    const dir = repo("no-ai", {
      "package.json": JSON.stringify({ name: "no-ai", version: "1.0.0" }),
      ...stubComponents(),
    });
    const { result } = await audit(dir);
    const governance = result.axes.find((a) => a.axis === "ai-governance")!;
    expect(governance.opportunities).toBe(0);
    expect(governance.score).toBe("N/A");
  });

  it("surfaces findings the score ignored instead of hiding them behind a clean ratio", async () => {
    const dir = repo("unscored-findings", {
      "package.json": JSON.stringify({ name: "unscored-findings", version: "1.0.0" }),
      ...stubComponents(),
      // tokens/no-hardcoded-color is experimental: reported, never scored.
      "src/components/Hardcoded.tsx":
        `export function Hardcoded(){ return <div style={{color:"#ff0000"}} />; }\n`,
    });
    const { result } = await audit(dir);
    const reported = result.findings.filter((f) => f.axis === "tokens").length;
    const tokens = result.axes.find((a) => a.axis === "tokens")!;
    if (reported > tokens.findings) {
      expect(tokens.unscoredFindings ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("configuring Lyse never makes Lyse see less", () => {
  // `lyse init` writes back the module detection resolved. Reading that as
  // "this repo consumes the module" dropped ds-self mode and emptied the
  // inventory: element-plus went 98 components -> 0 by running the setup
  // command the audit itself recommends.
  it("naming the detected design system in .lyse.yaml does not shrink the inventory", async () => {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ name: "root", version: "1.0.0", private: true, workspaces: ["packages/*"] }),
      "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
      "packages/ui/package.json": JSON.stringify({ name: "@acme/ui", version: "1.0.0" }),
    };
    for (const name of ["Alert", "Badge", "Card", "Dialog", "Input"]) {
      files[`packages/ui/src/${name}.tsx`] = `export function ${name}(){ return <div />; }\n`;
    }
    const before = await auditDirectory(repo("ds-self-unconfigured", files), {});
    const beforeCount = before.graph.components.length;
    expect(beforeCount).toBeGreaterThan(0);

    const configured = repo("ds-self-configured", {
      ...files,
      ".lyse.yaml": 'designSystem:\n  componentsModule: "@acme/ui"\n',
    });
    const after = await auditDirectory(configured, {});
    expect(after.graph.components.length).toBe(beforeCount);
  });
});

// 19% of findings on both held-out repos landed in files Lyse's own zone
// classifier had already labelled `test` — 17 of 88 on primer-react, 61 of 322
// on polaris. The largest score-contributing penalty group on primer,
// components/svg-viewbox x17, was 15/17 inside test files, flagging things like
// `vi.fn(() => <svg data-testid="icon" aria-hidden="true" />)` — a mock, not a
// component. Penalising a design system for its own test doubles measures
// nothing about the design system.
describe("test files never move the score", () => {
  it("reports no finding located inside a test file", async () => {
    const dir = repo("test-zone", {
      "package.json": JSON.stringify({ name: "test-zone", version: "1.0.0" }),
      "src/components/Icon.tsx":
        `export function Icon(){ return <svg viewBox="0 0 16 16" aria-hidden="true" />; }\n`,
      // Same violation in both files; only the source one is a real defect.
      "src/components/Broken.tsx":
        `export function Broken(){ return <svg aria-hidden="true" />; }\n`,
      "src/components/Icon.test.tsx":
        `const Mock = () => <svg data-testid="icon" aria-hidden="true" />;\nexport default Mock;\n`,
    });
    const { result } = await audit(dir);
    const inTests = result.findings.filter((f) => /\.(test|spec)\.[jt]sx?$/.test(f.location.file));
    expect(inTests.map((f) => `${f.ruleId} @ ${f.location.file}`)).toEqual([]);
  });

  it("still reports the same violation when it is in real source", async () => {
    const { result } = await audit(join(root, "test-zone"));
    expect(result.findings.some((f) => f.location.file.includes("Broken.tsx"))).toBe(true);
  });
});

// `versioning/changelog-present` fired "No structured CHANGELOG found" on
// element-plus, whose repo root holds CHANGELOG.en-US.md. It is a scored rule
// claiming precisionMeasured: 1. A fixed list of filenames is deterministic —
// it returns the same answer every run — but determinism is not correctness,
// and the catalogue was reading the first as evidence of the second.
describe("presence checks recognise the file when it is there", () => {
  it("finds a localised CHANGELOG at the repo root", async () => {
    const dir = repo("localised-changelog", {
      "package.json": JSON.stringify({ name: "loc", version: "1.0.0" }),
      "CHANGELOG.en-US.md": "# Changelog\n\n## [1.2.0]\n\n- something\n",
      ...stubComponents(),
    });
    const { result } = await audit(dir);
    const fired = result.findings.filter((f) => f.ruleId === "versioning/changelog-present");
    expect(fired.map((f) => f.message)).toEqual([]);
  });
});
