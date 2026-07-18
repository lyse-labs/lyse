import { describe, it, expect } from "vitest";
import { classifyZone, buildZoneMap } from "./zones.js";

const opts = { excludePaths: [], dsSelfMode: false };

describe("graph/zones classifyZone", () => {
  it("classifies a .stories file as story (before low-signal)", () => {
    expect(classifyZone("src/Button.stories.tsx", "export default {}", opts)).toBe("story");
  });
  it("classifies a plain app component as app", () => {
    expect(classifyZone("src/pages/Home.tsx", "export const Home = () => null;", opts)).toBe("app");
  });
  it("classifies a token/palette definition file as ds-source", () => {
    expect(classifyZone("src/tokens/palette.ts", "export const palette = {};", opts)).toBe("ds-source");
  });
  it("classifies a test file as test", () => {
    expect(classifyZone("src/Button.test.tsx", "it('x', () => {});", opts)).toBe("test");
  });
  it("classifies user-excluded paths as config", () => {
    expect(classifyZone("examples/demo.tsx", "x", { excludePaths: ["examples/**"], dsSelfMode: false })).toBe("config");
  });
  it("classifies app files as ds-source when the repo IS the DS", () => {
    expect(classifyZone("src/pages/Home.tsx", "x", { excludePaths: [], dsSelfMode: true })).toBe("ds-source");
  });
});

describe("graph/zones buildZoneMap", () => {
  it("builds a deterministic per-file map", () => {
    const map = buildZoneMap(
      [
        { rel: "src/Button.stories.tsx", source: "export default {}" },
        { rel: "src/App.tsx", source: "export const App = () => null;" },
      ],
      opts,
    );
    expect(map.byFile["src/Button.stories.tsx"]).toBe("story");
    expect(map.byFile["src/App.tsx"]).toBe("app");
  });
});
