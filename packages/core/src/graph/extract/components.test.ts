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
      // Content is irrelevant: `componentFiles` maps name -> source text, not
      // a path, and extractComponents never surfaces it via `file` (see the
      // dedicated regression test below).
      componentFiles: new Map([["Button", "src/Button.tsx"]]),
      dsSelfMode: false,
    });
    expect(nodes.map((n) => n.name)).toEqual(["Button", "Card"]);
    expect(nodes[0]).toEqual({
      name: "Button", file: null, module: "@acme/ui", exportKind: "unknown",
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

  it("never emits source text via `file` — regression for the componentFiles Map<name, sourceText> confusion", () => {
    const sourceText = [
      `import { forwardRef } from "react";`,
      ``,
      `export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {`,
      `  return <button ref={ref} {...props} />;`,
      `});`,
    ].join("\n");
    const { nodes } = extractComponents({
      baseInventory: [{ name: "Button", module: "@acme/ui", usageCount: 1 }],
      componentsModule: "@acme/ui",
      dsSelfMode: false,
      // A componentFiles entry whose value is a whole file's source text (the
      // real shape produced by callers) must still yield `file: null` — no
      // path is derivable from source text, and it must never leak into the
      // manifest / AGENTS.md instead of a path.
      componentFiles: new Map([["Button", sourceText]]),
    });
    expect(nodes[0]?.file).toBeNull();
  });
});
