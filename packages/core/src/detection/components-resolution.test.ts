import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveComponentsModule, buildInventoryForMode, resolveComponentSources } from "./components-resolution.js";
import type { ComponentsModuleDetection } from "./types.js";
import type { ParsedTsFile, StoryIndex } from "../types.js";

describe("resolveComponentsModule", () => {
  it("uses the structured dsSelf flag, not the human-readable source text", () => {
    const detected: ComponentsModuleDetection = {
      value: "@acme/ui",
      confidence: "high",
      source: "some entirely different wording",
      dsSelf: true,
      family: [{ name: "@acme/ui", relDir: "packages/ui" }],
    };
    expect(resolveComponentsModule(null, detected)).toEqual({
      componentsModule: "@acme/ui",
      dsSelfMode: true,
      family: [{ name: "@acme/ui", relDir: "packages/ui" }],
    });
  });

  it("does not set dsSelfMode when the detection is not self-DS", () => {
    const detected: ComponentsModuleDetection = {
      value: "@mui/material",
      confidence: "medium",
      source: "common UI library: @mui/material",
      dsSelf: false,
      family: [],
    };
    expect(resolveComponentsModule(null, detected)).toEqual({
      componentsModule: "@mui/material",
      dsSelfMode: false,
      family: [],
    });
  });

  it("an explicit config module wins and carries no family", () => {
    const detected: ComponentsModuleDetection = {
      value: "@other/ui", confidence: "high", source: "workspace DS export (@other/ui)",
      dsSelf: true, family: [{ name: "@other/ui", relDir: "packages/ui" }],
    };
    expect(resolveComponentsModule("@acme/ui", detected)).toEqual({
      componentsModule: "@acme/ui", dsSelfMode: false, family: [],
    });
  });

  it("returns null componentsModule when neither config nor detection has a value", () => {
    const detected: ComponentsModuleDetection = {
      value: null,
      confidence: "low",
      source: "no obvious componentsModule",
      dsSelf: false,
      family: [],
    };
    expect(resolveComponentsModule(null, detected)).toEqual({
      componentsModule: null,
      dsSelfMode: false,
      family: [],
    });
  });
});

describe("buildInventoryForMode", () => {
  it("dsSelfMode: builds inventory from componentSources directly, usageCount 0, props when extractable", () => {
    const buttonSrc = [
      `export function Button({ variant }: { variant: "primary" | "secondary" }) {`,
      `  return null;`,
      `}`,
    ].join("\n");
    // No FunctionDeclaration/VariableDeclarator named "Card" in this source —
    // extractComponentProps finds nothing and returns undefined.
    const cardSrc = `export { Card as default } from "./Card.impl";`;

    const result = buildInventoryForMode({
      componentsModule: "@acme/ui",
      dsSelfMode: true,
      parsedTs: [],
      componentSources: new Map([
        ["Button", buttonSrc],
        ["Card", cardSrc],
      ]),
    });

    expect(result).toHaveLength(2);
    const button = result.find((e) => e.name === "Button");
    const card = result.find((e) => e.name === "Card");

    expect(button).toEqual({
      name: "Button",
      module: "@acme/ui",
      usageCount: 0,
      props: [
        {
          name: "variant",
          typeText: '"primary" | "secondary"',
          isVariantUnion: true,
          variants: ["primary", "secondary"],
        },
      ],
    });
    expect(card).toEqual({ name: "Card", module: "@acme/ui", usageCount: 0 });
    expect(card?.props).toBeUndefined();
  });

  it("non-dsSelfMode: delegates to buildComponentInventory (import-count based)", () => {
    const parsedTs: ParsedTsFile[] = [
      {
        path: "src/App.tsx",
        ast: null,
        source: "",
        imports: [{ module: "@acme/ui", named: ["Button"], default: null, line: 1 }],
      },
    ];

    const result = buildInventoryForMode({
      componentsModule: "@acme/ui",
      dsSelfMode: false,
      parsedTs,
      componentSources: new Map(),
    });

    expect(result).toEqual([{ name: "Button", module: "@acme/ui", usageCount: 1 }]);
  });

  it("returns [] when componentsModule is null, in either mode", () => {
    expect(
      buildInventoryForMode({
        componentsModule: null,
        dsSelfMode: true,
        parsedTs: [],
        componentSources: new Map(),
      }),
    ).toEqual([]);
    expect(
      buildInventoryForMode({
        componentsModule: null,
        dsSelfMode: false,
        parsedTs: [],
        componentSources: new Map(),
      }),
    ).toEqual([]);
  });

  describe("per-component module attribution (ds-self, componentFilePaths)", () => {
    it("attributes each component to its own nearest-ancestor package.json name, not a single shared module", () => {
      const root = mkdtempSync(join(tmpdir(), "lyse-cr-multi-pkg-"));
      mkdirSync(join(root, "packages", "button", "src"), { recursive: true });
      mkdirSync(join(root, "packages", "icons", "src"), { recursive: true });
      writeFileSync(join(root, "packages", "button", "package.json"), JSON.stringify({ name: "@acme/button" }));
      writeFileSync(join(root, "packages", "icons", "package.json"), JSON.stringify({ name: "@acme/icons" }));
      const buttonPath = join(root, "packages", "button", "src", "Button.tsx");
      const iconPath = join(root, "packages", "icons", "src", "Icon.tsx");
      writeFileSync(buttonPath, `export function Button() {\n  return null;\n}\n`);
      writeFileSync(iconPath, `export function Icon() {\n  return null;\n}\n`);

      const result = buildInventoryForMode({
        componentsModule: "@acme/fallback",
        dsSelfMode: true,
        parsedTs: [],
        componentSources: new Map([
          ["Button", readFileSync(buttonPath, "utf8")],
          ["Icon", readFileSync(iconPath, "utf8")],
        ]),
        componentFilePaths: new Map([
          ["Button", buttonPath],
          ["Icon", iconPath],
        ]),
      });

      expect(result).toHaveLength(2);
      const button = result.find((e) => e.name === "Button");
      const icon = result.find((e) => e.name === "Icon");
      expect(button?.module).toBe("@acme/button");
      expect(icon?.module).toBe("@acme/icons");
      expect(button?.module).not.toBe(icon?.module);
    });

    it("falls back to componentsModule when the component's file has no ancestor package.json with a name", () => {
      const root = mkdtempSync(join(tmpdir(), "lyse-cr-no-pkg-"));
      mkdirSync(join(root, "orphan"), { recursive: true });
      const orphanPath = join(root, "orphan", "Widget.tsx");
      writeFileSync(orphanPath, `export function Widget() {\n  return null;\n}\n`);

      const result = buildInventoryForMode({
        componentsModule: "@acme/fallback",
        dsSelfMode: true,
        parsedTs: [],
        componentSources: new Map([["Widget", readFileSync(orphanPath, "utf8")]]),
        componentFilePaths: new Map([["Widget", orphanPath]]),
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.module).toBe("@acme/fallback");
    });

    it("falls back to componentsModule for a name missing from componentFilePaths (partial map)", () => {
      const srcMap = new Map([["Orphan", "export { Orphan as default } from \"./Orphan.impl\";"]]);
      const result = buildInventoryForMode({
        componentsModule: "@acme/fallback",
        dsSelfMode: true,
        parsedTs: [],
        componentSources: srcMap,
        componentFilePaths: new Map(),
      });

      expect(result).toEqual([{ name: "Orphan", module: "@acme/fallback", usageCount: 0 }]);
    });

    it("omitting componentFilePaths entirely reproduces the pre-fix behavior (every entry gets componentsModule)", () => {
      const result = buildInventoryForMode({
        componentsModule: "@acme/ui",
        dsSelfMode: true,
        parsedTs: [],
        componentSources: new Map([
          ["Button", "export function Button() { return null; }"],
          ["Card", "export function Card() { return null; }"],
        ]),
      });

      expect(result.every((e) => e.module === "@acme/ui")).toBe(true);
    });
  });
});

describe("resolveComponentSources", () => {
  it("prefers a non-private package over a private one, even when the private file is walked first (the Menu/token-contrast-checker shape)", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-cr-canon-"));
    mkdirSync(join(root, "packages", "internal-tool", "src", "components"), { recursive: true });
    mkdirSync(join(root, "packages", "menu", "src"), { recursive: true });
    writeFileSync(
      join(root, "packages", "internal-tool", "package.json"),
      JSON.stringify({ name: "@acme/internal-tool", private: true }),
    );
    writeFileSync(join(root, "packages", "menu", "package.json"), JSON.stringify({ name: "@acme/menu" }));
    const fakeSrc = `export function PlainMenu() { return null; }`;
    const realSrc = `export function Menu({ variant }: { variant: "default" }) { return null; }`;

    // Walk order: the PRIVATE file is walked first — the exact real-world bug shape.
    const fileContents = new Map<string, string>([
      ["packages/internal-tool/src/components/Menu.tsx", fakeSrc],
      ["packages/menu/src/Menu.tsx", realSrc],
    ]);

    const { componentSources, componentFilePaths } = resolveComponentSources(fileContents, root, null);

    expect(componentSources.get("Menu")).toBe(realSrc);
    expect(componentFilePaths.get("Menu")).toBe(join(root, "packages", "menu", "src", "Menu.tsx"));
  });

  it("still prefers non-private when the non-private file happens to be walked first (proves it's a rule, not luck)", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-cr-canon-order2-"));
    mkdirSync(join(root, "packages", "internal-tool", "src"), { recursive: true });
    mkdirSync(join(root, "packages", "menu", "src"), { recursive: true });
    writeFileSync(
      join(root, "packages", "internal-tool", "package.json"),
      JSON.stringify({ name: "@acme/internal-tool", private: true }),
    );
    writeFileSync(join(root, "packages", "menu", "package.json"), JSON.stringify({ name: "@acme/menu" }));
    const realSrc = `export function Menu() { return null; }`;
    const fakeSrc = `export function PlainMenu() { return null; }`;

    const fileContents = new Map<string, string>([
      ["packages/menu/src/Menu.tsx", realSrc],
      ["packages/internal-tool/src/Menu.tsx", fakeSrc],
    ]);

    const { componentSources } = resolveComponentSources(fileContents, root, null);
    expect(componentSources.get("Menu")).toBe(realSrc);
  });

  it("among two non-private candidates, prefers the one under a src/ directory", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-cr-canon-src-"));
    mkdirSync(join(root, "packages", "widget", "src"), { recursive: true });
    mkdirSync(join(root, "packages", "widget", "dist"), { recursive: true });
    writeFileSync(join(root, "packages", "widget", "package.json"), JSON.stringify({ name: "@acme/widget" }));
    const distSrc = `export function Widget() { return "compiled"; }`;
    const srcSrc = `export function Widget() { return "source"; }`;

    // dist/ walked first, src/ second — src/ must still win.
    const fileContents = new Map<string, string>([
      ["packages/widget/dist/Widget.tsx", distSrc],
      ["packages/widget/src/Widget.tsx", srcSrc],
    ]);

    const { componentSources } = resolveComponentSources(fileContents, root, null);
    expect(componentSources.get("Widget")).toBe(srcSrc);
  });

  it("falls back to first-encountered (walk order) when private and src/ both tie — the genuine cross-package collision shape (Td in table/ vs data-grid/)", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-cr-canon-tie-"));
    mkdirSync(join(root, "packages", "table", "src"), { recursive: true });
    mkdirSync(join(root, "packages", "data-grid", "src", "table"), { recursive: true });
    writeFileSync(join(root, "packages", "table", "package.json"), JSON.stringify({ name: "@acme/table" }));
    writeFileSync(join(root, "packages", "data-grid", "package.json"), JSON.stringify({ name: "@acme/data-grid" }));
    const tableSrc = `export function Td() { return "table"; }`;
    const gridSrc = `export function Td() { return "grid"; }`;

    const fileContents = new Map<string, string>([
      ["packages/table/src/Td.tsx", tableSrc],
      ["packages/data-grid/src/table/Td.tsx", gridSrc],
    ]);
    const { componentSources } = resolveComponentSources(fileContents, root, null);
    // Neither private nor src/ discriminate here (both non-private, both under
    // src/) — the first-encountered file (walk/insertion order) deterministically
    // wins, exactly as documented for the bottom tier.
    expect(componentSources.get("Td")).toBe(tableSrc);

    // Reversed insertion order flips the winner — proving the result tracks
    // walk order, not an accidental alphabetical/path artifact.
    const reversed = new Map<string, string>([
      ["packages/data-grid/src/table/Td.tsx", gridSrc],
      ["packages/table/src/Td.tsx", tableSrc],
    ]);
    const { componentSources: reversedSources } = resolveComponentSources(reversed, root, null);
    expect(reversedSources.get("Td")).toBe(gridSrc);
  });

  it("a strong (PascalCase filename) candidate beats a weak (dir-derived, story-corroborated) one, regardless of walk order", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-cr-canon-strong-"));
    mkdirSync(join(root, "packages", "button"), { recursive: true });
    writeFileSync(join(root, "packages", "button", "package.json"), JSON.stringify({ name: "@acme/button" }));
    const weakSrc = `export function Button() { return "weak"; }`;
    const strongSrc = `export function Button() { return "strong"; }`;
    const storyIndex: StoryIndex = { byTitle: new Map([["Button", { id: "button", importPath: "x" }]]) };

    // Weak (dir-derived: packages/button/button.tsx) walked first, strong second.
    const fileContents = new Map<string, string>([
      ["packages/button/button.tsx", weakSrc],
      ["packages/button/Button.tsx", strongSrc],
    ]);
    const { componentSources } = resolveComponentSources(fileContents, root, storyIndex);
    expect(componentSources.get("Button")).toBe(strongSrc);
  });

  it("skips a weak (dir-derived) name entirely when no Storybook title corroborates it", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-cr-canon-weakskip-"));
    const fileContents = new Map<string, string>([["packages/utils/index.tsx", `export function noop() {}`]]);
    const { componentSources } = resolveComponentSources(fileContents, root, null);
    expect(componentSources.size).toBe(0);
  });

  it("is deterministic: the same input produces byte-identical output across repeated calls", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-cr-canon-det-"));
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    mkdirSync(join(root, "packages", "b"), { recursive: true });
    writeFileSync(join(root, "packages", "a", "package.json"), JSON.stringify({ name: "@acme/a", private: true }));
    writeFileSync(join(root, "packages", "b", "package.json"), JSON.stringify({ name: "@acme/b" }));
    const fileContents = new Map<string, string>([
      ["packages/a/Foo.tsx", "export function Foo() { return 1; }"],
      ["packages/b/Foo.tsx", "export function Foo() { return 2; }"],
    ]);

    const run1 = resolveComponentSources(fileContents, root, null);
    const run2 = resolveComponentSources(fileContents, root, null);
    expect([...run1.componentSources]).toEqual([...run2.componentSources]);
    expect([...run1.componentFilePaths]).toEqual([...run2.componentFilePaths]);
  });
});
