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

  it("excludes **/__mocks__/** by default", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "tools", "github", "__mocks__"), { recursive: true });
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "tools", "github", "__mocks__", "AiHandler.ts"), "export class AiHandler {}");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("tools", "github", "__mocks__", "AiHandler.ts"));
  });

  it("excludes **/__fixtures__/** by default (the Jest double-underscore convention, distinct from **/fixtures/**)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "packages", "box", "__fixtures__"), { recursive: true });
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(join(tmp, "packages", "box", "__fixtures__", "CustomizableBox.tsx"), "export const C = 1;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("packages", "box", "__fixtures__", "CustomizableBox.tsx"));
  });

  it("excludes component files nested under a stories/ subfolder by default (Storybook demo components, e.g. <pkg>/stories/components/*.tsx)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "src"));
    mkdirSync(join(tmp, "packages", "data-grid", "stories", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "a.tsx"), "export const x = 1;");
    writeFileSync(
      join(tmp, "packages", "data-grid", "stories", "components", "DataGridDemo.tsx"),
      "export const D = 1;",
    );

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("src/a.tsx");
    expect(rel).not.toContain(join("packages", "data-grid", "stories", "components", "DataGridDemo.tsx"));
  });

  it("keeps stylesheets nested under a stories/ subfolder (a real token source on some repos, e.g. radix-ui/primitives keeps CSS custom properties in apps/storybook/stories/*.stories.module.css) while still excluding code files in the same directory", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "apps", "storybook", "stories"), { recursive: true });
    writeFileSync(
      join(tmp, "apps", "storybook", "stories", "Button.stories.module.css"),
      ":root { --accent: #7c3aed; }",
    );
    writeFileSync(join(tmp, "apps", "storybook", "stories", "Button.stories.scss"), "$accent: #7c3aed;");
    writeFileSync(join(tmp, "apps", "storybook", "stories", "Button.stories.tsx"), "export const B = 1;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain(join("apps", "storybook", "stories", "Button.stories.module.css"));
    expect(rel).toContain(join("apps", "storybook", "stories", "Button.stories.scss"));
    expect(rel).not.toContain(join("apps", "storybook", "stories", "Button.stories.tsx"));
  });

  it("does not over-exclude legitimately-named dirs that merely contain 'mock'/'fixture'/'stor' as a substring, not an exact segment", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "packages", "mock-utils", "src"), { recursive: true });
    mkdirSync(join(tmp, "packages", "fixture-generator", "src"), { recursive: true });
    mkdirSync(join(tmp, "packages", "app", "src", "stores"), { recursive: true });
    mkdirSync(join(tmp, "packages", "storybook-addon", "src"), { recursive: true });
    writeFileSync(join(tmp, "packages", "mock-utils", "src", "MockUtils.tsx"), "export const M = 1;");
    writeFileSync(join(tmp, "packages", "fixture-generator", "src", "Generator.tsx"), "export const G = 1;");
    writeFileSync(join(tmp, "packages", "app", "src", "stores", "UserStore.tsx"), "export const U = 1;");
    writeFileSync(join(tmp, "packages", "storybook-addon", "src", "Addon.tsx"), "export const A = 1;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("packages/mock-utils/src/MockUtils.tsx");
    expect(rel).toContain("packages/fixture-generator/src/Generator.tsx");
    expect(rel).toContain("packages/app/src/stores/UserStore.tsx");
    expect(rel).toContain("packages/storybook-addon/src/Addon.tsx");
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

  it("excludes nested doc/demo-site packages inside a monorepo (e.g. packages/paste-website/**)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "packages", "foo-website", "src"), { recursive: true });
    mkdirSync(join(tmp, "packages", "paste-website", "src", "components"), { recursive: true });
    mkdirSync(join(tmp, "packages", "docs-site", "src"), { recursive: true });
    mkdirSync(join(tmp, "packages", "button", "src"), { recursive: true });
    writeFileSync(join(tmp, "packages", "foo-website", "src", "Marketing.tsx"), "export const M = 1;");
    writeFileSync(
      join(tmp, "packages", "paste-website", "src", "components", "Whats.tsx"),
      "export const W = 2;",
    );
    writeFileSync(join(tmp, "packages", "docs-site", "src", "X.tsx"), "export const X = 3;");
    writeFileSync(join(tmp, "packages", "button", "src", "Button.tsx"), "export const Button = 4;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).not.toContain("packages/foo-website/src/Marketing.tsx");
    expect(rel).not.toContain("packages/paste-website/src/components/Whats.tsx");
    expect(rel).not.toContain("packages/docs-site/src/X.tsx");
    expect(rel).toContain("packages/button/src/Button.tsx");
  });

  it("does not over-exclude legitimately-named packages that merely contain 'website' as a substring (e.g. packages/website-ui/**)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-walker-defaults-"));
    mkdirSync(join(tmp, "packages", "website-ui", "src"), { recursive: true });
    writeFileSync(join(tmp, "packages", "website-ui", "src", "Card.tsx"), "export const Card = 1;");

    const files = await walk(tmp);
    const rel = files.map((f) => posixRelative(tmp, f));
    expect(rel).toContain("packages/website-ui/src/Card.tsx");
  });
});
