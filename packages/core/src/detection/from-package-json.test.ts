import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { detectFromPackageJson } from "./from-package-json.js";

/**
 * A monorepo whose design system lives in `packages/*` and whose docs site
 * lives in `apps/*` — the shape carbon, polaris and element-plus all have.
 */
function buildMonorepo(): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-detect-"));
  const write = (rel: string, body: string) => {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  };
  write("package.json", JSON.stringify({ name: "acme", private: true, workspaces: ["packages/*", "apps/*"] }));
  write("packages/ui/package.json", JSON.stringify({ name: "@acme/ui", main: "index.js" }));
  write("packages/ui/src/Button.tsx", "export const Button = () => null;\n");
  write("packages/ui/src/Card.tsx", "export const Card = () => null;\n");
  write("packages/icons/package.json", JSON.stringify({ name: "@acme/icons", main: "index.js" }));
  write("packages/icons/src/Icon.tsx", "export const Icon = () => null;\n");
  write("apps/docs/package.json", JSON.stringify({ name: "@acme/docs", private: true }));
  write("apps/docs/src/Page.tsx", "export const Page = () => null;\n");
  return root;
}

describe("detectFromPackageJson — detection from inside the monorepo", () => {
  let root: string;
  beforeAll(() => {
    root = buildMonorepo();
  });

  it("resolves the DS family from the workspace root (unchanged)", async () => {
    const d = await detectFromPackageJson(root);
    expect(d.componentsModule.dsSelf).toBe(true);
    expect(d.componentsModule.family.map((m) => m.name).sort()).toEqual(["@acme/icons", "@acme/ui"]);
    expect(d.componentsModule.family.find((m) => m.name === "@acme/ui")?.relDir).toBe("packages/ui");
  });

  it("resolves the design system when audited from the DS package directory", async () => {
    // `cd packages/ui && lyse audit`. Branch 3 requires `private: true` AND a
    // `workspaces` field, so a package directory reached Branch 3 with neither
    // and detection returned null — which made `buildInventoryForMode` return
    // `[]` (it needs a non-null componentsModule), so the component inventory
    // came back EMPTY on a design system's own source. Measured on the golden
    // corpus before this fix: carbon `packages/react` and polaris
    // `polaris-react` both reported `components: 0, extraction degraded`.
    const d = await detectFromPackageJson(join(root, "packages", "ui"));
    expect(d.componentsModule.value).toBe("@acme/ui");
    expect(d.componentsModule.dsSelf).toBe(true);
  });

  it("labels the package you are actually in, not the workspace family's primary", async () => {
    // `choosePrimary` may well pick @acme/icons (more component files wins ties
    // on a real repo). Inside packages/ui the answer must be @acme/ui.
    const d = await detectFromPackageJson(join(root, "packages", "icons"));
    expect(d.componentsModule.value).toBe("@acme/icons");
  });

  it("rebases the family onto the audited directory and drops members outside it", async () => {
    // `resolveComponentSources` matches `familyDirs` against paths relative to
    // the AUDIT root. A relDir of "packages/ui" would match nothing when the
    // audit root already is packages/ui, and a sibling package's directory is
    // not in the audited tree at all.
    const d = await detectFromPackageJson(join(root, "packages", "ui"));
    expect(d.componentsModule.family).toEqual([{ name: "@acme/ui", relDir: "" }]);
  });

  it("does not claim ds-self for an app inside the monorepo", async () => {
    const d = await detectFromPackageJson(join(root, "apps", "docs"));
    expect(d.componentsModule.dsSelf).toBe(false);
    expect(d.componentsModule.value).toBeNull();
  });

  it("does not claim ds-self for a directory that merely sits inside a DS package", async () => {
    // `packages/core/fixtures/svelte-ds` in this very repo: a fixture two levels
    // inside a package. An earlier version accepted any descendant of a family
    // member, audited that fixture in ds-self mode, and silenced the token rules
    // it exists to exercise. A directory inside a package is not that package.
    mkdirSync(join(root, "packages", "ui", "fixtures", "vendored"), { recursive: true });
    writeFileSync(
      join(root, "packages", "ui", "fixtures", "vendored", "Widget.tsx"),
      "export const Widget = () => null;\n",
    );
    const d = await detectFromPackageJson(join(root, "packages", "ui", "fixtures", "vendored"));
    expect(d.componentsModule.dsSelf).toBe(false);
    expect(d.componentsModule.value).toBeNull();
  });

  it("still reports nothing for a standalone package with no workspace above it", async () => {
    const solo = mkdtempSync(join(tmpdir(), "lyse-detect-solo-"));
    mkdirSync(join(solo, "src"), { recursive: true });
    writeFileSync(join(solo, "package.json"), JSON.stringify({ name: "just-an-app" }));
    writeFileSync(join(solo, "src", "Button.tsx"), "export const Button = () => null;\n");
    const d = await detectFromPackageJson(solo);
    expect(d.componentsModule.value).toBeNull();
    expect(d.componentsModule.dsSelf).toBe(false);
  });

  it("does not walk out of the repository — a .git boundary stops the search", async () => {
    // Without a boundary, auditing any directory would keep climbing into the
    // user's home and could adopt an unrelated monorepo above it as context.
    const outer = mkdtempSync(join(tmpdir(), "lyse-detect-outer-"));
    writeFileSync(join(outer, "package.json"), JSON.stringify({ name: "outer", private: true, workspaces: ["packages/*"] }));
    mkdirSync(join(outer, "packages", "ui", "src"), { recursive: true });
    writeFileSync(join(outer, "packages", "ui", "package.json"), JSON.stringify({ name: "@outer/ui", main: "index.js" }));
    writeFileSync(join(outer, "packages", "ui", "src", "Button.tsx"), "export const Button = () => null;\n");
    // An inner repository of its own, nested inside the outer workspace.
    const inner = join(outer, "packages", "ui", "vendored");
    mkdirSync(join(inner, ".git"), { recursive: true });
    mkdirSync(join(inner, "sub"), { recursive: true });
    writeFileSync(join(inner, "package.json"), JSON.stringify({ name: "vendored" }));
    writeFileSync(join(inner, "sub", "package.json"), JSON.stringify({ name: "vendored-sub" }));
    const d = await detectFromPackageJson(join(inner, "sub"));
    expect(d.componentsModule.value).toBeNull();
  });
});
