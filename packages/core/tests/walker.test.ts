import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { posixRelative } from "../src/util/paths.js";
import { walk } from "../src/walker.js";

describe("walker", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "lyse-walker-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "node_modules", "x"), { recursive: true });
    writeFileSync(join(root, "src", "a.tsx"), "export default 1;");
    writeFileSync(join(root, "src", "b.css"), ".x{}");
    writeFileSync(join(root, "src", "c.txt"), "ignore me");
    writeFileSync(join(root, "node_modules", "x", "d.tsx"), "should be ignored");
    writeFileSync(join(root, ".gitignore"), "src/c.txt\n");
  });

  it("returns matching files relative to root, respects .gitignore and node_modules", async () => {
    const files = await walk(root);
    const rel = files.map((f) => posixRelative(root, f)).sort();
    expect(rel).toEqual(["src/a.tsx", "src/b.css"]);
  });
});

describe("walker default excludes", () => {
  it("excludes examples/ by default", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "examples", "basic"), { recursive: true });
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "examples", "basic", "b.tsx"), "export const y = 2;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("examples", "basic", "b.tsx"));
  });

  it("excludes apps/docs/ by default", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "apps", "docs", "pages"), { recursive: true });
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "apps", "docs", "pages", "index.tsx"), "export const z = 3;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("apps", "docs", "pages", "index.tsx"));
  });

  it("excludes packages/dev/ by default", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "packages", "dev", "scripts"), { recursive: true });
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "packages", "dev", "scripts", "gen.ts"), "export const g = 4;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("packages", "dev", "scripts", "gen.ts"));
  });

  it("excludes **/fixtures/** by default", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "packages", "core", "fixtures"), { recursive: true });
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "packages", "core", "fixtures", "full-ds.tsx"), "export const f = 5;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("packages", "core", "fixtures", "full-ds.tsx"));
  });

  it("merges user excludePaths with defaults (user paths extend, not replace)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "examples"));
    mkdirSync(join(tmp, "custom-dir"));
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "examples", "b.tsx"), "export const y = 2;");
    writeFileSync(join(tmp, "custom-dir", "c.tsx"), "export const z = 3;");

    const files = await walk(tmp, { extraIgnores: ["custom-dir/**"] });
    const rel = files.map((f) => posixRelative(tmp, f));
    // src is included
    expect(rel).toContain("src/a.tsx");
    // default excludes still apply
    expect(rel).not.toContain(join("examples", "b.tsx"));
    // user exclude also applies
    expect(rel).not.toContain(join("custom-dir", "c.tsx"));
  });

  it("excludes starters/ by default", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "starters", "vite"), { recursive: true });
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "starters", "vite", "App.tsx"), "export const s = 6;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("starters", "vite", "App.tsx"));
  });

  it("excludes playground/ by default", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "playground"));
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "playground", "test.tsx"), "export const p = 7;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("playground", "test.tsx"));
  });

  it("excludes e2e/ by default", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "e2e"));
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "e2e", "spec.ts"), "export const e = 8;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("e2e", "spec.ts"));
  });
});
