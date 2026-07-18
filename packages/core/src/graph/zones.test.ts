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

describe("classifyZone — real-repo conventions (P2)", () => {
  it("classifies hyphen/scss story-styling files as story", () => {
    expect(classifyZone("src/components/AILabel/ailabel-story.scss", "", opts)).toBe("story");
    expect(classifyZone("src/components/Grid/Grid.stories.scss", "", opts)).toBe("story");
  });
  it("classifies figma / code-connect files as config", () => {
    expect(classifyZone("code-connect/AILabel/AILabel.figma.tsx", "", opts)).toBe("config");
    expect(classifyZone("src/components/Button/Button.figma.ts", "", opts)).toBe("config");
  });
  it("classifies hyphen-test and bare test.scss as test", () => {
    expect(classifyZone("src/components/ComboBox/ComboBox-test.js", "", opts)).toBe("test");
    expect(classifyZone("src/components/FluidTextInput/test.scss", "", opts)).toBe("test");
  });
  it("classifies previewer infra as config", () => {
    expect(classifyZone("previewer/storybookStyles/index.tsx", "", opts)).toBe("config");
  });
  it("does NOT reclassify ordinary app source", () => {
    expect(classifyZone("src/components/Toggle/Toggle.tsx", "", opts)).toBe("app");
    expect(classifyZone("src/components/DatePicker/DatePicker.tsx", "", opts)).toBe("app");
  });
});

describe("classifyZone — component registry ds-source (P2)", () => {
  it("classifies registry component source as ds-source", () => {
    expect(classifyZone("apps/v4/registry/new-york/ui/button.tsx", "", opts)).toBe("ds-source");
    expect(classifyZone("packages/shadcn/src/registry/index.ts", "", opts)).toBe("ds-source");
  });
  it("classifies theme-variant ui trees as ds-source", () => {
    expect(classifyZone("apps/v4/styles/base-luma/ui/button.tsx", "", opts)).toBe("ds-source");
    expect(classifyZone("apps/v4/styles/radix-luma/ui/aspect-ratio.tsx", "", opts)).toBe("ds-source");
  });
  it("does NOT classify an app 'registry' data page as ds-source unless under a registry/ dir", () => {
    expect(classifyZone("src/pages/registry-status.tsx", "", opts)).toBe("app");
  });
});
