import { describe, it, expect } from "vitest";
import { collectReExportedNames } from "../../src/loaders/public-exports.js";

describe("collectReExportedNames", () => {
  it("collects named re-exports with a source", () => {
    const r = collectReExportedNames(`export { Button } from './button';`);
    expect(r.names).toEqual(["Button"]);
    expect(r.starFrom).toEqual([]);
  });

  it("collects `export { default as X } from`", () => {
    const r = collectReExportedNames(`export { default as Card } from './card';`);
    expect(r.names).toEqual(["Card"]);
  });

  it("collects `export { Local as Public }` aliasing (exported name wins)", () => {
    const r = collectReExportedNames(`export { internalBtn as Button } from './x';`);
    expect(r.names).toEqual(["Button"]);
  });

  it("collects local named exports without a source", () => {
    const r = collectReExportedNames(`import { Button } from './b';\nexport { Button };`);
    expect(r.names).toEqual(["Button"]);
  });

  it("collects local declared exports (function/const) when PascalCase", () => {
    const r = collectReExportedNames(
      `export function Dialog() { return null; }\nexport const Tooltip = () => null;`,
    );
    expect(r.names.sort()).toEqual(["Dialog", "Tooltip"]);
  });

  it("records `export * from` specifiers in starFrom", () => {
    const r = collectReExportedNames(`export * from './primitives';`);
    expect(r.starFrom).toEqual(["./primitives"]);
    expect(r.names).toEqual([]);
  });

  it("ignores non-PascalCase names (hooks, constants)", () => {
    const r = collectReExportedNames(
      `export { useButton } from './h';\nexport const DEFAULT = 1;`,
    );
    expect(r.names).toEqual([]);
  });

  it("ignores `export type { X }` type-only re-exports", () => {
    const r = collectReExportedNames(`export type { ButtonProps } from './button';`);
    expect(r.names).toEqual([]);
  });

  it("returns empty on parse failure", () => {
    const r = collectReExportedNames(`export { from from from`);
    expect(r).toEqual({ names: [], starFrom: [] });
  });
});
