import { describe, it, expect } from "vitest";
import { extractComponents } from "./components.js";
import type { ComponentInventoryEntry } from "../../types.js";

describe("extractComponents", () => {
  it("enriches inventory entries into ComponentNodes, preserving name/module/usageCount/props and order", () => {
    const baseInventory: ComponentInventoryEntry[] = [
      { name: "Button", module: "@acme/ui", usageCount: 3, props: [{ name: "variant" }] },
      { name: "Card", module: "@acme/ui", usageCount: 1 },
    ];
    const { nodes } = extractComponents({
      baseInventory,
      componentsModule: "@acme/ui",
      dsSelfMode: false,
      componentFiles: new Map([["Button", "src/Button.tsx"]]),
    });
    expect(nodes.map((n) => n.name)).toEqual(["Button", "Card"]);
    expect(nodes[0]).toEqual({
      name: "Button", file: "src/Button.tsx", module: "@acme/ui", exportKind: "unknown",
      usageCount: 3, props: [{ name: "variant" }], isDsComponent: true, storyRefs: [], detection: "module-config",
    });
    expect(nodes[1]?.file).toBeNull();
    expect(nodes[1]?.props).toEqual([]);
  });

  it("marks detection ds-self in dsSelfMode", () => {
    const { nodes } = extractComponents({
      baseInventory: [{ name: "Button", module: "@acme/ui", usageCount: 0 }],
      componentsModule: "@acme/ui",
      dsSelfMode: true,
      componentFiles: new Map(),
    });
    expect(nodes[0]?.detection).toBe("ds-self");
  });
});
