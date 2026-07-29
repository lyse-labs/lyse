import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveComponentsModule, buildInventoryForMode } from "./components-resolution.js";
import type { DetectionResult } from "./types.js";
import type { ParsedTsFile } from "../types.js";

describe("resolveComponentsModule", () => {
  it("explicit config wins over detection, and detection is not consulted for dsSelfMode", () => {
    const detected: DetectionResult<string> = {
      value: "@other/ui",
      confidence: "high",
      source: "workspace DS export (@other/ui)",
    };
    expect(resolveComponentsModule("@acme/ui", detected)).toEqual({
      componentsModule: "@acme/ui",
      dsSelfMode: false,
    });
  });

  it("falls back to detection and sets dsSelfMode when the source is a workspace DS export", () => {
    const detected: DetectionResult<string> = {
      value: "@acme/ui",
      confidence: "high",
      source: "workspace DS export (@acme/ui)",
    };
    expect(resolveComponentsModule(null, detected)).toEqual({
      componentsModule: "@acme/ui",
      dsSelfMode: true,
    });
  });

  it("falls back to detection without dsSelfMode when the source is not a workspace DS export", () => {
    const detected: DetectionResult<string> = {
      value: "@acme/ui",
      confidence: "medium",
      source: "dependency",
    };
    expect(resolveComponentsModule(null, detected)).toEqual({
      componentsModule: "@acme/ui",
      dsSelfMode: false,
    });
  });

  it("returns null componentsModule when neither config nor detection has a value", () => {
    const detected: DetectionResult<string> = {
      value: null,
      confidence: "low",
      source: "no obvious componentsModule",
    };
    expect(resolveComponentsModule(null, detected)).toEqual({
      componentsModule: null,
      dsSelfMode: false,
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
