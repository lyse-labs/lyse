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

  it("ignores CSS comments that contain braces or custom properties", () => {
    const css = `/* { --x: red } */ :root { --color-bg: #fff; }`;
    const m = buildTokenSourceMap(css);
    expect(m.get("--color-bg")!.get("root")).toBe("#fff");
    expect(m.size).toBe(1);
  });

  it("maps @media-nested :root tokens to root mode, not a garbage @media key", () => {
    const css = `@media (prefers-color-scheme: dark) { :root { --color-bg: #111; } }`;
    const m = buildTokenSourceMap(css);
    expect(m.get("--color-bg")?.get("root")).toBe("#111");
    for (const [, byMode] of m) {
      for (const mode of byMode.keys()) {
        expect(mode).not.toMatch(/@media/);
      }
    }
  });
});
