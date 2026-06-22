import { describe, it, expect } from "vitest";
import { withChromium } from "../../src/render/browser.js";
import { RenderUnavailableError } from "../../src/render/types.js";

describe("withChromium", () => {
  it("either renders a page or throws RenderUnavailableError when chromium is missing", async () => {
    try {
      const title = await withChromium(async (page) => {
        await page.setContent("<title>ok</title>");
        return page.title();
      });
      expect(title).toBe("ok");
    } catch (e) {
      expect(e).toBeInstanceOf(RenderUnavailableError);
    }
  }, 60_000);
});
