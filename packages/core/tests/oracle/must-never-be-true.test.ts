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
