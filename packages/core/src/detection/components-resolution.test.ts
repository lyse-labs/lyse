import { describe, it, expect } from "vitest";
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
});
