import { describe, it, expect } from "vitest";
import { fileBelongsToOwner } from "./nested-packages.js";

/** `create-vite` and its 17 template mini-projects, the shape that fooled detection. */
const VITE_PKG_JSONS = new Set([
  "packages/create-vite/package.json",
  "packages/create-vite/template-solid/package.json",
  "packages/create-vite/template-qwik-ts/package.json",
]);

describe("fileBelongsToOwner", () => {
  it("keeps a file in the package's own source", () => {
    expect(fileBelongsToOwner("packages/create-vite/src/index.tsx", "packages/create-vite", VITE_PKG_JSONS))
      .toBe(true);
  });

  it("rejects a file inside a nested package", () => {
    // vitejs/vite was reported as a design system because `create-vite`'s 24
    // component-shaped files are project TEMPLATES it copies into new repos.
    // Each template carries its own package.json, so those files are not
    // create-vite's source — they belong to a package that is not a workspace
    // member, and should count for nobody.
    expect(fileBelongsToOwner("packages/create-vite/template-solid/src/App.jsx", "packages/create-vite", VITE_PKG_JSONS))
      .toBe(false);
    expect(fileBelongsToOwner("packages/create-vite/template-qwik-ts/src/app.tsx", "packages/create-vite", VITE_PKG_JSONS))
      .toBe(false);
  });

  it("does not treat the owner's OWN package.json as nesting", () => {
    expect(fileBelongsToOwner("packages/create-vite/index.tsx", "packages/create-vite", VITE_PKG_JSONS))
      .toBe(true);
  });

  it("handles a package at the repo root", () => {
    expect(fileBelongsToOwner("src/Button.tsx", "", new Set(["package.json"]))).toBe(true);
    expect(fileBelongsToOwner("fixtures/demo/src/A.tsx", "", new Set(["package.json", "fixtures/demo/package.json"])))
      .toBe(false);
  });

  it("is unaffected by a package.json that is a sibling, not an ancestor", () => {
    expect(fileBelongsToOwner(
      "packages/ui/src/Button.tsx", "packages/ui",
      new Set(["packages/ui/package.json", "packages/other/package.json"]),
    )).toBe(true);
  });

  it("rejects at any nesting depth, not only one level", () => {
    expect(fileBelongsToOwner(
      "packages/ui/examples/demo/src/A.tsx", "packages/ui",
      new Set(["packages/ui/package.json", "packages/ui/examples/demo/package.json"]),
    )).toBe(false);
  });
});
