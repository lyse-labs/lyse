import { describe, it, expect } from "vitest";
import { withChromium } from "../../src/render/browser.js";
import { probeComputedTokens } from "../../src/render/token-probe.js";
import { RenderUnavailableError } from "../../src/render/types.js";

const CSS = `:root { --color-bg: #ffffff; } .dark { --color-bg: #111111; } .leak { --color-bg: #ff0000; }`;

describe("probeComputedTokens", () => {
  it("reads computed token values under root and mode selectors", async () => {
    try {
      const readings = await withChromium((page) =>
        probeComputedTokens(page, CSS, ["--color-bg"], [".dark"]),
      );
      const root = readings.find((r) => r.mode === "root")!;
      const dark = readings.find((r) => r.mode === ".dark")!;
      expect(root.computed.replace(/\s/g, "")).toBe("#ffffff");
      expect(dark.computed.replace(/\s/g, "")).toBe("#111111");
    } catch (e) {
      if (!(e instanceof RenderUnavailableError)) throw e;
    }
  }, 60_000);
});
