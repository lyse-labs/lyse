import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { isDsComponent } from "../../src/rules/_ds-component.js";

function sf(code: string) {
  const p = new Project({ useInMemoryFileSystem: true });
  return p.createSourceFile("f.tsx", code);
}
const ctx = (mod: string | null) => ({
  componentsModule: mod,
  componentInventory: [{ name: "Card", module: "@org/ui" }],
});

describe("isDsComponent", () => {
  it("true when the tag is imported from componentsModule", () => {
    const s = sf(`import { Button } from "@org/ui";\nexport const X = () => <Button/>;`);
    expect(isDsComponent("Button", s, ctx("@org/ui"))).toBe(true);
  });
  it("false for a lowercase raw HTML tag", () => {
    const s = sf(`export const X = () => <div/>;`);
    expect(isDsComponent("div", s, ctx("@org/ui"))).toBe(false);
  });
  it("false for a local PascalCase component not from the DS", () => {
    const s = sf(
      `const MyThing = () => null;\nexport const X = () => <MyThing/>;`
    );
    expect(isDsComponent("MyThing", s, ctx("@org/ui"))).toBe(false);
  });
  it("true when the tag is in the component inventory (DS module)", () => {
    const s = sf(`export const X = () => <Card/>;`);
    expect(isDsComponent("Card", s, ctx("@org/ui"))).toBe(true);
  });
  it("false when no componentsModule and not in inventory", () => {
    const s = sf(
      `import { Button } from "@org/ui";\nexport const X = () => <Button/>;`
    );
    expect(
      isDsComponent("Button", s, {
        componentsModule: null,
        componentInventory: [],
      })
    ).toBe(false);
  });
});
