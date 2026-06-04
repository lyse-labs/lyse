import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { computeHistograms } from "../../src/bench/evidence-pack/histograms.js";

const FIXTURE = join(__dirname, "..", "..", ".tmp", "histograms");

describe("computeHistograms", () => {
  beforeAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    await mkdir(join(FIXTURE, "src"), { recursive: true });
    await writeFile(
      join(FIXTURE, "src", "comp.tsx"),
      `const x = "#FF0000"; <img alt="ok" aria-label="x" role="button" tabIndex={0} />`,
    );
    await writeFile(
      join(FIXTURE, "src", "comp.stories.tsx"),
      `import { Meta } from "@storybook/react"; export default {} as Meta;`,
    );
    await writeFile(
      join(FIXTURE, "src", "comp.test.tsx"),
      `import { describe, it } from "vitest"; describe("x", () => { it("y", () => {}); });`,
    );
  });

  it("counts raw hex literals in token-discipline histogram", async () => {
    const h = await computeHistograms(FIXTURE);
    expect(h.tokenDiscipline.rawHexCount).toBe(1);
    expect(h.tokenDiscipline.filesScanned).toBeGreaterThanOrEqual(1);
  });

  it("counts a11y attributes accurately", async () => {
    const h = await computeHistograms(FIXTURE);
    expect(h.a11yAttributes.ariaAttrCount).toBe(1);
    expect(h.a11yAttributes.altAttrCount).toBe(1);
    expect(h.a11yAttributes.roleAttrCount).toBe(1);
    expect(h.a11yAttributes.tabIndexCount).toBe(1);
  });

  it("counts story files and identifies framework", async () => {
    const h = await computeHistograms(FIXTURE);
    expect(h.storyFiles.count).toBe(1);
    expect(h.storyFiles.extensions[".stories.tsx"]).toBe(1);
  });

  it("counts test files and identifies vitest framework", async () => {
    const h = await computeHistograms(FIXTURE);
    expect(h.testFiles.count).toBe(1);
    expect(h.testFiles.framework).toBe("vitest");
  });
});
