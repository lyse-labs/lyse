import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { identifyDsFamily, countComponentFilesByPackage, MIN_COMPONENT_FILES } from "./ds-packages.js";
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

  it("admits a package holding exactly MIN_COMPONENT_FILES and rejects one holding one fewer", () => {
    const packages = [
      pkg("@acme/at-floor", "packages/at-floor"),
      pkg("@acme/below-floor", "packages/below-floor", { hasPublicEntry: false }),
    ];
    const counts = new Map([
      ["@acme/at-floor", MIN_COMPONENT_FILES],
      ["@acme/below-floor", MIN_COMPONENT_FILES - 1],
    ]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@acme/at-floor"]);
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

  it("disqualifies singular app/demo/guide/nextjs directories, not just their plural forms", () => {
    // Real shape, ariakit + mantine (bench corpus): a demo app, a docs guide
    // and a Next.js integration example each live at a bare, singular,
    // top-level directory that the plural-only segment list let through.
    const packages = [
      pkg("@ariakit/react-components", "packages/ariakit-react-components"),
      pkg("app", "app", { hasPublicEntry: true }),
      pkg("guide", "guide", { hasPublicEntry: true }),
      pkg("nextjs", "nextjs", { hasPublicEntry: true }),
      pkg("@mantinex/demo", "packages/@mantinex/demo"),
    ];
    const counts = new Map([
      ["@ariakit/react-components", 181], ["app", 99], ["guide", 6], ["nextjs", 4], ["@mantinex/demo", 17],
    ]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@ariakit/react-components"]);
    expect(family.primary).toBe("@ariakit/react-components");
    expect(family.evidence["app"]?.disqualifiedBy).toBe("app-or-site-directory");
    expect(family.evidence["guide"]?.disqualifiedBy).toBe("app-or-site-directory");
    expect(family.evidence["nextjs"]?.disqualifiedBy).toBe("app-or-site-directory");
    expect(family.evidence["@mantinex/demo"]?.disqualifiedBy).toBe("app-or-site-directory");
  });

  it("disqualifies a scoped package whose local name (after the scope) is a bare docs/tooling word", () => {
    // Real shape, ariakit + corvu (bench corpus): corvu's docs site is
    // scoped as `@corvu/web`, not bare `web`, and ariakit ships React test
    // utilities as `@ariakit/test`, not bare `test` — neither is caught by
    // full-string equality against the bare word.
    const packages = [
      pkg("@corvu/accordion", "packages/accordion"),
      pkg("@corvu/web", "web", { hasPublicEntry: false }),
      pkg("@ariakit/react-components", "packages/ariakit-react-components"),
      pkg("@ariakit/test", "packages/ariakit-test"),
    ];
    const counts = new Map([
      ["@corvu/accordion", 4], ["@corvu/web", 52], ["@ariakit/react-components", 181], ["@ariakit/test", 1],
    ]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@ariakit/react-components", "@corvu/accordion"]);
    expect(family.evidence["@corvu/web"]?.disqualifiedBy).toBe("docs-or-site-name");
    expect(family.evidence["@ariakit/test"]?.disqualifiedBy).toBe("docs-or-site-name");
  });

  it("does not disqualify a real component package at packages/web just because its local name is a bare disqualifying word", () => {
    // The concrete risk this narrowing exists to close: a cross-platform
    // design system split as packages/native + packages/web, where
    // @acme/web is the real component library. Only a package whose ENTIRE
    // relDir is the single top-level segment "web" (corvu's docs site) is
    // disqualified — never one nested under a real packages directory.
    const packages = [
      pkg("@acme/native", "packages/native"),
      pkg("@acme/web", "packages/web"),
    ];
    const counts = new Map([["@acme/native", 30], ["@acme/web", 50]]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@acme/native", "@acme/web"]);
    expect(family.evidence["@acme/web"]?.disqualifiedBy).toBeNull();
  });

  it("disqualifies a single-segment top-level 'tests' directory the same way as corvu's bare 'web'", () => {
    const packages = [
      pkg("@acme/ui", "packages/ui"),
      pkg("qa-tools", "tests", { hasPublicEntry: false }),
    ];
    const counts = new Map([["@acme/ui", 40], ["qa-tools", 12]]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@acme/ui"]);
    expect(family.evidence["qa-tools"]?.disqualifiedBy).toBe("docs-or-site-name");
  });

  it("disqualifies a scoped name ending in exactly /tests or /docs, not just /test", () => {
    const packages = [
      pkg("@acme/ui", "packages/ui"),
      pkg("@acme/tests", "packages/acme-tests", { hasPublicEntry: false }),
      pkg("@acme/docs", "packages/acme-docs-site", { hasPublicEntry: false }),
    ];
    const counts = new Map([["@acme/ui", 40], ["@acme/tests", 8], ["@acme/docs", 6]]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@acme/ui"]);
    expect(family.evidence["@acme/tests"]?.disqualifiedBy).toBe("docs-or-site-name");
    expect(family.evidence["@acme/docs"]?.disqualifiedBy).toBe("docs-or-site-name");
  });

  it("does not disqualify an unscoped package merely named 'test' when it isn't at a bare top-level 'test' directory", () => {
    // The scoped-name shape is derived from "no real design system
    // publishes itself as @scope/test" — an unscoped name carries no such
    // signal, so it must not be disqualified by name alone.
    const packages = [pkg("test", "packages/test-runner")];
    const counts = new Map([["test", 5]]);
    const family = identifyDsFamily(packages, counts);
    expect(family.evidence["test"]?.disqualifiedBy).toBeNull();
  });

  it("matches the bare-directory and scoped-name shapes case-insensitively", () => {
    // A private member named @org/Web sitting at a capitalised top-level
    // "Web" directory, and a scoped @acme/Test, evaded the old
    // case-sensitive match.
    const packages = [
      pkg("@acme/ui", "packages/ui"),
      pkg("@org/Web", "Web", { private: true, hasPublicEntry: false }),
      pkg("@acme/Test", "packages/acme-Test", { hasPublicEntry: false }),
    ];
    const counts = new Map([["@acme/ui", 40], ["@org/Web", 20], ["@acme/Test", 6]]);
    const family = identifyDsFamily(packages, counts);
    expect(family.members.map(m => m.name)).toEqual(["@acme/ui"]);
    expect(family.evidence["@org/Web"]?.disqualifiedBy).toBe("docs-or-site-name");
    expect(family.evidence["@acme/Test"]?.disqualifiedBy).toBe("docs-or-site-name");
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

  it("picks a stable primary: public entry, then most component files, then shallowest, then lexicographic", () => {
    const packages = [
      pkg("@acme/zeta", "packages/zeta"),
      pkg("@acme/alpha", "packages/nested/deep/alpha"),
      pkg("@acme/beta", "packages/beta", { hasPublicEntry: false }),
    ];
    const counts = new Map([["@acme/zeta", 5], ["@acme/alpha", 5], ["@acme/beta", 5]]);
    expect(identifyDsFamily(packages, counts).primary).toBe("@acme/zeta");
  });

  it("prefers more component-file evidence over alphabetical order when public entry and directory depth are tied", () => {
    // Real shape, documenso (bench corpus): @documenso/ee (packages/ee, a
    // single-file commercial add-on) and @documenso/ui (packages/ui, the
    // real 116-file component library) sit at the same depth and both
    // declare a public entry, so the old order fell straight through to
    // the name tiebreak — "ee" sorts before "ui" — and picked the add-on.
    // A regression against the shipped DS_EXPORT_RE behaviour, which
    // correctly resolved ui.
    const packages = [
      pkg("@documenso/ee", "packages/ee"),
      pkg("@documenso/ui", "packages/ui"),
    ];
    const counts = new Map([["@documenso/ee", 1], ["@documenso/ui", 116]]);
    expect(identifyDsFamily(packages, counts).primary).toBe("@documenso/ui");
  });

  it("still prefers a package with a public entry over one with far more component files but no public entry", () => {
    // Real shape, paste (bench corpus): @twilio-paste/icons has the highest
    // raw component-file count in the repo (339) but declares no `exports`
    // and no `main` — a package with a real public entry must win ahead of
    // it, or the fix regresses the original bug it exists to close.
    const packages = [
      pkg("@twilio-paste/icons", "packages/icons", { hasPublicEntry: false }),
      pkg("@twilio-paste/core", "packages/core"),
    ];
    const counts = new Map([["@twilio-paste/icons", 339], ["@twilio-paste/core", 118]]);
    expect(identifyDsFamily(packages, counts).primary).toBe("@twilio-paste/core");
  });

  it("falls back to component-file count as the tiebreak before directory depth, even when the shallower candidate has fewer files", () => {
    const packages = [
      pkg("@acme/thin-root", "packages/thin"),
      pkg("@acme/thick-nested", "packages/nested/thick"),
    ];
    const counts = new Map([["@acme/thin-root", 2], ["@acme/thick-nested", 40]]);
    expect(identifyDsFamily(packages, counts).primary).toBe("@acme/thick-nested");
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

  it("builds evidence with keys sorted alphabetically, regardless of input order — CLAUDE.md determinism", () => {
    const packages = [
      pkg("@acme/zeta", "packages/zeta"), pkg("@acme/alpha", "packages/alpha"), pkg("@acme/mid", "packages/mid"),
    ];
    const counts = new Map([["@acme/zeta", 5], ["@acme/alpha", 5], ["@acme/mid", 5]]);
    const family = identifyDsFamily(packages, counts);
    expect(Object.keys(family.evidence)).toEqual(["@acme/alpha", "@acme/mid", "@acme/zeta"]);

    const reversed = identifyDsFamily([...packages].reverse(), counts);
    expect(Object.keys(reversed.evidence)).toEqual(["@acme/alpha", "@acme/mid", "@acme/zeta"]);
  });
});

describe("countComponentFilesByPackage", () => {
  it("attributes each component file to its nearest owning package, ignoring tests and stories", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-dsfam-"));
    const write = (rel: string, body = "export const X = 1;") => {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, body);
    };
    write("packages/ui/src/Button.tsx");
    write("packages/ui/src/Card.tsx");
    write("packages/ui/src/Card.test.tsx");
    write("packages/ui/src/Card.stories.tsx");
    write("packages/ui/nested/inner/src/Deep.tsx");
    write("packages/icons/src/Icon.tsx");
    write("packages/scripts/build.ts");

    const packages = [
      { name: "@acme/ui", relDir: "packages/ui", private: false, hasPublicEntry: true },
      { name: "@acme/inner", relDir: "packages/ui/nested/inner", private: false, hasPublicEntry: true },
      { name: "@acme/icons", relDir: "packages/icons", private: false, hasPublicEntry: true },
      { name: "@acme/scripts", relDir: "packages/scripts", private: false, hasPublicEntry: false },
    ];
    const counts = await countComponentFilesByPackage(root, packages);
    expect(counts.get("@acme/ui")).toBe(2);
    expect(counts.get("@acme/inner")).toBe(1);
    expect(counts.get("@acme/icons")).toBe(1);
    expect(counts.get("@acme/scripts")).toBeUndefined();
  });

  it("ignores component-shaped files under test, mock, fixture and e2e directories", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-dsfam-"));
    const write = (rel: string, body = "export const X = 1;") => {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, body);
    };
    write("packages/only-fixtures/__tests__/Button.tsx");
    write("packages/only-fixtures/__mocks__/Card.tsx");
    write("packages/only-fixtures/__fixtures__/Chip.tsx");
    write("packages/only-fixtures/test/Alert.tsx");
    write("packages/only-fixtures/tests/Badge.tsx");
    write("packages/only-fixtures/fixtures/Tag.tsx");
    write("packages/only-fixtures/e2e/Flow.tsx");
    write("packages/only-fixtures/src/Real.tsx");

    const packages = [
      { name: "@acme/only-fixtures", relDir: "packages/only-fixtures", private: false, hasPublicEntry: true },
    ];
    const counts = await countComponentFilesByPackage(root, packages);
    expect(counts.get("@acme/only-fixtures")).toBe(1);
  });
});
