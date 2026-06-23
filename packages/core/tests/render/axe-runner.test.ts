import { describe, it, expect } from "vitest";
import { injectAndRunAxe, axeVersion } from "../../src/render/axe-runner.js";
import { withChromium } from "../../src/render/browser.js";
import { RenderUnavailableError } from "../../src/render/types.js";

// Validate the inject→run→map wiring against a real browser. We constrain axe
// to a single rule (image-alt) so the assertion is deterministic and does not
// depend on axe's full WCAG ruleset (which would also flag missing <title>,
// landmarks, etc. on a minimal page). Skips cleanly when Chromium is absent.
const IMAGE_ALT_ONLY = { runOnly: { type: "rule", values: ["image-alt"] } };

describe("axe-runner", () => {
  it("axeVersion returns a semver-shaped string", () => {
    expect(axeVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("flags an <img> with no alt and passes an <img> with alt", async () => {
    try {
      const bad = await withChromium(async (page) => {
        await page.setContent(`<!doctype html><html lang="en"><body><img src="x.png"></body></html>`);
        return injectAndRunAxe(page, IMAGE_ALT_ONLY);
      });
      expect(bad.some((v) => v.ruleId === "image-alt")).toBe(true);
      expect(bad[0]!.nodes).toBeGreaterThan(0);

      const clean = await withChromium(async (page) => {
        await page.setContent(`<!doctype html><html lang="en"><body><img src="x.png" alt="a logo"></body></html>`);
        return injectAndRunAxe(page, IMAGE_ALT_ONLY);
      });
      expect(clean).toEqual([]);
    } catch (e) {
      if (!(e instanceof RenderUnavailableError)) throw e;
    }
  }, 60_000);
});
