import { describe, it, expect } from "vitest";
import { identifyDsFamily } from "./ds-packages.js";
import type { WorkspacePackage } from "./types.js";

const pkg = (name: string, relDir: string, over: Partial<WorkspacePackage> = {}): WorkspacePackage => ({
  name, relDir, private: false, hasPublicEntry: true, ...over,
});

describe("identifyDsFamily", () => {
  it("keeps every package with component evidence — a DS is a family, not one package", () => {
    const packages = [
      pkg("@radix-ui/react-tabs", "packages/react/tabs"),
      pkg("@radix-ui/react-presence", "packages/react/presence"),
      pkg("@radix-ui/react-dialog", "packages/react/dialog"),
    ];
    const counts = new Map([
      ["@radix-ui/react-tabs", 2], ["@radix-ui/react-presence", 2], ["@radix-ui/react-dialog", 2],
    ]);
    const family = identifyDsFamily(packages, counts);
    expect(family.isDesignSystem).toBe(true);
    expect(family.members.map(m => m.name)).toEqual([
      "@radix-ui/react-dialog", "@radix-ui/react-presence", "@radix-ui/react-tabs",
    ]);
  });

  it("admits a package holding exactly MIN_COMPONENT_FILES (2) and rejects one holding 1", () => {
    const packages = [pkg("@acme/two", "packages/two"), pkg("@acme/one", "packages/one", { hasPublicEntry: false })];
    const family = identifyDsFamily(packages, new Map([["@acme/two", 2], ["@acme/one", 1]]));
    expect(family.members.map(m => m.name)).toEqual(["@acme/two"]);
  });

  it("disqualifies apps, docs sites and playgrounds by directory", () => {
    const packages = [
      pkg("@calcom/ui", "packages/ui", { private: true }),
      pkg("@calcom/web", "apps/web", { private: true, hasPublicEntry: false }),
      pkg("vuetifyjs.com", "packages/docs"),
      pkg("@skeletonlabs/playground-svelte", "playgrounds/svelte"),
    ];
    const counts = new Map([
      ["@calcom/ui", 111], ["@calcom/web", 582], ["vuetifyjs.com", 1219], ["@skeletonlabs/playground-svelte", 40],
    ]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@calcom/ui"]);
    expect(family.evidence["@calcom/web"]?.disqualifiedBy).toBe("app-or-site-directory");
  });

  it("disqualifies a docs-demo package and a test package by name, even when public and huge", () => {
    const packages = [
      pkg("@mantine/core", "packages/@mantine/core"),
      pkg("@docs/demos", "packages/@docs/demos"),
      pkg("@mantine-tests/core", "packages/@mantine-tests/core"),
    ];
    const counts = new Map([["@mantine/core", 400], ["@docs/demos", 1879], ["@mantine-tests/core", 30]]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@mantine/core"]);
    expect(family.evidence["@docs/demos"]?.disqualifiedBy).toBe("docs-or-site-name");
    expect(family.evidence["@mantine-tests/core"]?.disqualifiedBy).toBe("test-or-tooling-name");
  });

  it("never disqualifies purely for being private when the package has component evidence", () => {
    const packages = [pkg("@calcom/ui", "packages/ui", { private: true, hasPublicEntry: false })];
    const family = identifyDsFamily(packages, new Map([["@calcom/ui", 111]]));
    expect(family.members.map(m => m.name)).toEqual(["@calcom/ui"]);
  });

  it("excludes the workspace root package", () => {
    const packages = [pkg("monorepo-root", ""), pkg("@acme/ui", "packages/ui")];
    const family = identifyDsFamily(packages, new Map([["monorepo-root", 3000], ["@acme/ui", 40]]));
    expect(family.members.map(m => m.name)).toEqual(["@acme/ui"]);
  });

  it("abstains rather than guessing when nothing has evidence", () => {
    const packages = [pkg("@acme/scripts", "packages/scripts", { hasPublicEntry: false })];
    const family = identifyDsFamily(packages, new Map());
    expect(family).toMatchObject({ isDesignSystem: false, members: [], primary: null });
  });

  it("picks a stable primary: public entry, then shallowest, then lexicographic", () => {
    const packages = [
      pkg("@acme/zeta", "packages/zeta"),
      pkg("@acme/alpha", "packages/nested/deep/alpha"),
      pkg("@acme/beta", "packages/beta", { hasPublicEntry: false }),
    ];
    const counts = new Map([["@acme/zeta", 5], ["@acme/alpha", 5], ["@acme/beta", 5]]);
    expect(identifyDsFamily(packages, counts).primary).toBe("@acme/zeta");
  });

  it("is order-independent: shuffling the input does not change the output", () => {
    const packages = [
      pkg("@acme/ui", "packages/ui"), pkg("@acme/icons", "packages/icons"), pkg("@acme/core", "packages/core"),
    ];
    const counts = new Map([["@acme/ui", 9], ["@acme/icons", 40], ["@acme/core", 3]]);
    const a = identifyDsFamily(packages, counts);
    const b = identifyDsFamily([...packages].reverse(), counts);
    expect(b).toEqual(a);
  });
});
