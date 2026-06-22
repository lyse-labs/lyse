import { describe, it, expect } from "vitest";
import { buildTokenSourceMap, detectModeSelectors } from "../../src/render/token-source-map.js";

const CSS = `
:root { --color-bg: #ffffff; --space-md: 16px; }
.dark { --color-bg: #111111; }
`;

describe("token source map", () => {
  it("maps each token to its declared value per mode", () => {
    const m = buildTokenSourceMap(CSS);
    expect(m.get("--color-bg")!.get("root")).toBe("#ffffff");
    expect(m.get("--color-bg")!.get(".dark")).toBe("#111111");
    expect(m.get("--space-md")!.get("root")).toBe("16px");
  });
  it("detects non-root mode selectors that declare tokens", () => {
    expect(detectModeSelectors(CSS)).toEqual([".dark"]);
  });
});
