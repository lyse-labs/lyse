import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { detectFromPackageJson, enumerateWorkspacePackages } from "../../src/detection/from-package-json.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lyse-pkg-")); });

describe("detectFromPackageJson", () => {
  it("detects React from dependencies", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    const r = await detectFromPackageJson(dir);
    expect(r.framework.value).toBe("react");
    expect(r.framework.confidence).toBe("high");
  });

  it("prefers internal-named componentsModule over public lib", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      dependencies: { "@my-org/ui": "^1.0.0", "@mui/material": "^5.0.0" }
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@my-org/ui");
  });

  it("falls back to common UI library if no internal package", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      dependencies: { "@mui/material": "^5.0.0" }
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@mui/material");
    expect(r.componentsModule.confidence).toBe("medium");
  });

  it("detects Storybook from devDependencies", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { "@storybook/react": "^7.0.0" } }));
    const r = await detectFromPackageJson(dir);
    expect(r.storybook.value).toBe(true);
  });

  it("detects pnpm from packageManager field", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "pnpm@9.12.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.packageManager.value).toBe("pnpm");
  });

  it("returns null values when package.json absent", async () => {
    const r = await detectFromPackageJson(dir);
    expect(r.framework.value).toBe(null);
    expect(r.componentsModule.value).toBe(null);
  });

  it("detects TypeScript from devDependencies", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }));
    const r = await detectFromPackageJson(dir);
    expect(r.hasTypeScript.value).toBe(true);
  });
});

describe("detectComponentsModule — workspace DS-self detection", () => {
  it("detects @primer/react when root is private with workspaces", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      devDependencies: { typescript: "^5.0.0" },
    }));
    mkdirSync(join(dir, "packages", "react", "src"), { recursive: true });
    writeFileSync(join(dir, "packages", "react", "package.json"), JSON.stringify({ name: "@primer/react", version: "36.0.0" }));
    // Evidence, not the name, is what qualifies @primer/react now.
    writeFileSync(join(dir, "packages", "react", "src", "Button.tsx"), "export const Button = 1;");
    writeFileSync(join(dir, "packages", "react", "src", "Card.tsx"), "export const Card = 1;");
    mkdirSync(join(dir, "packages", "build-tooling"), { recursive: true });
    writeFileSync(join(dir, "packages", "build-tooling", "package.json"), JSON.stringify({ name: "@primer/build-tooling", version: "1.0.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@primer/react");
    expect(r.componentsModule.confidence).toBe("high");
    expect(r.componentsModule.source).toContain("workspace");
  });

  it("detects @mui/material with workspaces and ignores internal packages", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      devDependencies: { typescript: "^5.0.0" },
    }));
    mkdirSync(join(dir, "packages", "material", "src"), { recursive: true });
    writeFileSync(join(dir, "packages", "material", "package.json"), JSON.stringify({ name: "@mui/material", version: "6.0.0" }));
    writeFileSync(join(dir, "packages", "material", "src", "Button.tsx"), "export const Button = 1;");
    writeFileSync(join(dir, "packages", "material", "src", "Card.tsx"), "export const Card = 1;");
    mkdirSync(join(dir, "packages", "internal-test-utils"), { recursive: true });
    writeFileSync(join(dir, "packages", "internal-test-utils", "package.json"), JSON.stringify({ name: "@mui/internal-test-utils", version: "1.0.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@mui/material");
    expect(r.componentsModule.confidence).toBe("high");
  });

  it("returns null when workspaces exist but no DS-named package found", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      devDependencies: { typescript: "^5.0.0" },
    }));
    mkdirSync(join(dir, "packages", "utils"), { recursive: true });
    writeFileSync(join(dir, "packages", "utils", "package.json"), JSON.stringify({ name: "@foo/bar-utils", version: "1.0.0" }));
    mkdirSync(join(dir, "packages", "build-tools"), { recursive: true });
    writeFileSync(join(dir, "packages", "build-tools", "package.json"), JSON.stringify({ name: "@foo/build-tools", version: "1.0.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBeNull();
  });

  it("does NOT false-positive on @vitest/ui (denylist)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      devDependencies: { "@vitest/ui": "^2.0.0", react: "^18.0.0" },
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBeNull();
  });

  it("falls back to legacy detection when no workspaces", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      dependencies: { "@calcom/ui": "^1.0.0" },
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@calcom/ui");
    expect(r.componentsModule.confidence).toBe("high");
  });

  it("supports workspaces as { packages: [...] } object format", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: { packages: ["packages/*"] },
      devDependencies: {},
    }));
    mkdirSync(join(dir, "packages", "core", "src"), { recursive: true });
    writeFileSync(join(dir, "packages", "core", "package.json"), JSON.stringify({ name: "@mantine/core", version: "7.0.0" }));
    writeFileSync(join(dir, "packages", "core", "src", "Button.tsx"), "export const Button = 1;");
    writeFileSync(join(dir, "packages", "core", "src", "Card.tsx"), "export const Card = 1;");
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@mantine/core");
    expect(r.componentsModule.confidence).toBe("high");
  });
});

describe("detectComponentsModule — self-DS vs consumer (P0)", () => {
  it("self-DS monorepo: workspace-owned @org/components → workspace DS family (dsSelfMode-eligible)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      dependencies: { "@acme/components": "workspace:*" },
    }));
    mkdirSync(join(dir, "packages", "components", "src"), { recursive: true });
    writeFileSync(join(dir, "packages", "components", "package.json"), JSON.stringify({ name: "@acme/components" }));
    // Evidence, not the name, is what makes this the design system.
    writeFileSync(join(dir, "packages", "components", "src", "Button.tsx"), "export const Button = 1;");
    writeFileSync(join(dir, "packages", "components", "src", "Card.tsx"), "export const Card = 1;");
    const r = await detectFromPackageJson(dir);
    // The structured flag, not source-text sniffing — see components-resolution.ts.
    expect(r.componentsModule.dsSelf).toBe(true);
  });

  it("consumer app: external @org/ui dependency → internal-named UI package (NOT self-DS)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      dependencies: { "@acme/ui": "^1.2.3" },
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.dsSelf).toBe(false);
    expect(r.componentsModule.value).toBe("@acme/ui");
  });
});

describe("detectComponentsModule — ownership guard gated on pkg.private (regression)", () => {
  it("non-private root with workspaces + workspace-member UI dep → still returns internal-named UI package", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      workspaces: ["packages/*"],
      dependencies: { "@acme/ui": "^1.0.0" },
    }));
    mkdirSync(join(dir, "packages", "ui"), { recursive: true });
    writeFileSync(join(dir, "packages", "ui", "package.json"), JSON.stringify({ name: "@acme/ui" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@acme/ui");
    expect(r.componentsModule.source).toBe("internal-named UI package");
  });

  it("private monorepo with an external, non-member UI dep → internal-named UI package (not self-DS)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      dependencies: { "@external/ui": "^2.0.0" },
    }));
    mkdirSync(join(dir, "packages", "core"), { recursive: true });
    writeFileSync(join(dir, "packages", "core", "package.json"), JSON.stringify({ name: "@acme/core" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@external/ui");
    expect(r.componentsModule.source).toBe("internal-named UI package");
    expect(r.componentsModule.dsSelf).toBe(false);
  });
});

describe("detectComponentsModule — deterministic tie-break (#Task1)", () => {
  it("returns the same componentsModule on repeated runs when several packages have equal evidence", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
    // All 4 qualify (2 component files, no public entry, same directory depth)
    // so `choosePrimary`'s only remaining tie-break is the name itself —
    // deterministic, not "whichever fast-glob returned first".
    for (const name of ["@acme/react", "@acme/components", "@acme/core", "@acme/ui"]) {
      const sub = join(dir, "packages", name.split("/")[1] ?? "x");
      mkdirSync(join(sub, "src"), { recursive: true });
      writeFileSync(join(sub, "package.json"), JSON.stringify({ name }));
      writeFileSync(join(sub, "src", "A.tsx"), "export const A = 1;");
      writeFileSync(join(sub, "src", "B.tsx"), "export const B = 1;");
    }
    const seen = new Set<string | null>();
    for (let i = 0; i < 20; i++) {
      const r = await detectFromPackageJson(dir);
      seen.add(r.componentsModule.value);
    }
    expect(seen.size).toBe(1);
    expect([...seen]).toEqual(["@acme/components"]);
  });
});

describe("enumerateWorkspacePackages — non-object JSON in a workspace member's package.json (regression)", () => {
  // `JSON.parse` accepts `null`, arrays, and bare scalars as valid JSON — none of
  // them are a package.json "object". A workspace member with such content must be
  // skipped like any other malformed member, not crash the whole audit.
  it("skips a member whose package.json is literally `null` and still detects a healthy sibling", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
    }));
    mkdirSync(join(dir, "packages", "broken"), { recursive: true });
    writeFileSync(join(dir, "packages", "broken", "package.json"), "null");
    mkdirSync(join(dir, "packages", "ui", "src"), { recursive: true });
    writeFileSync(join(dir, "packages", "ui", "package.json"), JSON.stringify({ name: "@acme/ui" }));
    writeFileSync(join(dir, "packages", "ui", "src", "Button.tsx"), "export const Button = 1;");
    writeFileSync(join(dir, "packages", "ui", "src", "Card.tsx"), "export const Card = 1;");

    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@acme/ui");
  });

  it("skips a member whose package.json is a JSON array and still detects a healthy sibling", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
    }));
    mkdirSync(join(dir, "packages", "broken"), { recursive: true });
    writeFileSync(join(dir, "packages", "broken", "package.json"), "[]");
    mkdirSync(join(dir, "packages", "ui", "src"), { recursive: true });
    writeFileSync(join(dir, "packages", "ui", "package.json"), JSON.stringify({ name: "@acme/ui" }));
    writeFileSync(join(dir, "packages", "ui", "src", "Button.tsx"), "export const Button = 1;");
    writeFileSync(join(dir, "packages", "ui", "src", "Card.tsx"), "export const Card = 1;");

    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@acme/ui");
  });

  it("skips a member whose package.json is a bare JSON string and still detects a healthy sibling", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
    }));
    mkdirSync(join(dir, "packages", "broken"), { recursive: true });
    writeFileSync(join(dir, "packages", "broken", "package.json"), "\"hello\"");
    mkdirSync(join(dir, "packages", "ui", "src"), { recursive: true });
    writeFileSync(join(dir, "packages", "ui", "package.json"), JSON.stringify({ name: "@acme/ui" }));
    writeFileSync(join(dir, "packages", "ui", "src", "Button.tsx"), "export const Button = 1;");
    writeFileSync(join(dir, "packages", "ui", "src", "Card.tsx"), "export const Card = 1;");

    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@acme/ui");
  });
});

describe("enumerateWorkspacePackages — dedupe by name (determinism)", () => {
  it("keeps exactly one entry when two members share a name, tie-broken by relDir — not by fast-glob order", async () => {
    // z-copy is created (and would sort/glob-return) before a-copy; if dedupe
    // just kept "whatever came first on disk" this would pick z-copy instead.
    mkdirSync(join(dir, "packages", "z-copy"), { recursive: true });
    writeFileSync(join(dir, "packages", "z-copy", "package.json"), JSON.stringify({ name: "@acme/dup" }));
    mkdirSync(join(dir, "packages", "a-copy"), { recursive: true });
    writeFileSync(join(dir, "packages", "a-copy", "package.json"), JSON.stringify({ name: "@acme/dup" }));

    const packages = await enumerateWorkspacePackages({ private: true, workspaces: ["packages/*"] }, dir);

    const dups = packages.filter(p => p.name === "@acme/dup");
    expect(dups).toHaveLength(1);
    expect(dups[0]?.relDir).toBe("packages/a-copy");
  });

  it("is stable across repeated calls", async () => {
    mkdirSync(join(dir, "packages", "second"), { recursive: true });
    writeFileSync(join(dir, "packages", "second", "package.json"), JSON.stringify({ name: "@acme/dup" }));
    mkdirSync(join(dir, "packages", "first"), { recursive: true });
    writeFileSync(join(dir, "packages", "first", "package.json"), JSON.stringify({ name: "@acme/dup" }));

    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const packages = await enumerateWorkspacePackages({ private: true, workspaces: ["packages/*"] }, dir);
      const dup = packages.find(p => p.name === "@acme/dup");
      seen.add(JSON.stringify(dup));
    }
    expect(seen.size).toBe(1);
  });
});

describe("detectComponentsModule — evidence-based DS family (Task 3)", () => {
  it("picks the design system by evidence, not by package name", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*", "apps/*"] }));
    const addPkg = (rel: string, manifest: Record<string, unknown>, componentFiles: string[]) => {
      const sub = join(dir, rel);
      mkdirSync(join(sub, "src"), { recursive: true });
      writeFileSync(join(sub, "package.json"), JSON.stringify(manifest));
      for (const f of componentFiles) writeFileSync(join(sub, "src", f), "export const X = 1;");
    };
    // Named nothing like a design system, but it IS one.
    addPkg("packages/vuetify", { name: "vuetify", main: "index.js" }, ["VBtn.tsx", "VCard.tsx", "VChip.tsx"]);
    // Named like one, but it is the docs site.
    addPkg("apps/ui", { name: "@acme/ui", main: "index.js" }, ["Marketing.tsx", "Hero.tsx"]);

    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("vuetify");
    expect(r.componentsModule.dsSelf).toBe(true);
    expect(r.componentsModule.family.map(m => m.name)).toEqual(["vuetify"]);
  });

  it("abstains instead of inventing a module when no package has evidence", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
    const sub = join(dir, "packages", "scripts");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "package.json"), JSON.stringify({ name: "@acme/ui-scripts" }));

    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBeNull();
    expect(r.componentsModule.dsSelf).toBe(false);
    expect(r.componentsModule.family).toEqual([]);
  });

  it("gives the same answer whether the repo path is absolute or relative", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
    const sub = join(dir, "packages", "ui");
    mkdirSync(join(sub, "src"), { recursive: true });
    writeFileSync(join(sub, "package.json"), JSON.stringify({ name: "@acme/ui", main: "index.js" }));
    writeFileSync(join(sub, "src", "Button.tsx"), "export const Button = () => null;");
    writeFileSync(join(sub, "src", "Card.tsx"), "export const Card = () => null;");

    const fromAbsolute = await detectFromPackageJson(dir);
    const fromRelative = await detectFromPackageJson(relative(process.cwd(), dir));

    expect(fromAbsolute.componentsModule.value).toBe("@acme/ui");
    expect(fromRelative.componentsModule.value).toBe(fromAbsolute.componentsModule.value);
    expect(fromRelative.componentsModule.family).toEqual(fromAbsolute.componentsModule.family);
  });

  it("reports workspace directories relative to the repo root even for a relative root", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
    const sub = join(dir, "packages", "ui");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "package.json"), JSON.stringify({ name: "@acme/ui" }));

    const pkg = { private: true, workspaces: ["packages/*"] };
    const found = await enumerateWorkspacePackages(pkg, relative(process.cwd(), dir));

    expect(found.map(p => p.relDir)).toEqual(["packages/ui"]);
  });
});
