import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { collectCanonicalSamples } from "../../src/bench/evidence-pack/sampler.js";

const FIXTURE = join(__dirname, "..", "..", ".tmp", "sampler");

describe("collectCanonicalSamples", () => {
  beforeAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    const compDir = join(FIXTURE, "packages", "ui", "src", "components");
    await mkdir(compDir, { recursive: true });
    await writeFile(join(compDir, "Box.tsx"), "export const Box = () => null;");
    await writeFile(join(compDir, "Stack.tsx"), "export const Stack = () => null;");
    await writeFile(
      join(compDir, "Card.tsx"),
      `import { Box } from "./Box"; import { Stack } from "./Stack"; export const Card = () => <Box><Stack/></Box>;`,
    );
    await writeFile(join(compDir, "TextField.tsx"), "export const TextField = () => <input />;");
    await writeFile(join(compDir, "GridLayout.tsx"), "export const GridLayout = () => null;");
    await writeFile(join(compDir, "Box.stories.tsx"), "export default {};");
    await writeFile(join(compDir, "Box.test.tsx"), "import { it } from 'vitest'; it('x', () => {});");
    await mkdir(join(FIXTURE, "packages", "ui", "src", "tokens"), { recursive: true });
    await writeFile(join(FIXTURE, "packages", "ui", "src", "tokens", "tokens.json"), '{}');
    await writeFile(join(FIXTURE, "tsconfig.json"), "{}");
    await writeFile(join(FIXTURE, "package.json"), '{"name":"x"}');
  });

  it("samples primitive components (PascalCase single-word)", async () => {
    const s = await collectCanonicalSamples(FIXTURE);
    const paths = s.primitiveComponents.map((c) => c.path);
    expect(paths).toContain("packages/ui/src/components/Box.tsx");
    expect(paths).toContain("packages/ui/src/components/Stack.tsx");
  });

  it("samples compound components (importing 2+ other components)", async () => {
    const s = await collectCanonicalSamples(FIXTURE);
    expect(s.compoundComponents.some((c) => c.path === "packages/ui/src/components/Card.tsx")).toBe(true);
  });

  it("samples form components", async () => {
    const s = await collectCanonicalSamples(FIXTURE);
    expect(s.formComponents.some((c) => c.path.endsWith("TextField.tsx"))).toBe(true);
  });

  it("samples layout components", async () => {
    const s = await collectCanonicalSamples(FIXTURE);
    expect(s.layoutComponents.some((c) => c.path.endsWith("GridLayout.tsx"))).toBe(true);
  });

  it("samples stories, tests, token files, config files", async () => {
    const s = await collectCanonicalSamples(FIXTURE);
    expect(s.stories.length).toBeGreaterThanOrEqual(1);
    expect(s.tests.length).toBeGreaterThanOrEqual(1);
    expect(s.tokenFiles.some((c) => c.path.endsWith("tokens.json"))).toBe(true);
    expect(s.configFiles.some((c) => c.path === "tsconfig.json")).toBe(true);
  });

  it("returns each sample with deterministic sha256 + byteCount", async () => {
    const s = await collectCanonicalSamples(FIXTURE);
    for (const sample of s.primitiveComponents) {
      expect(sample.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(sample.byteCount).toBeGreaterThan(0);
    }
  });

  it("sorts samples by (byteCount asc, path asc) for determinism", async () => {
    const a = await collectCanonicalSamples(FIXTURE);
    const b = await collectCanonicalSamples(FIXTURE);
    expect(a.primitiveComponents.map((c) => c.path)).toEqual(b.primitiveComponents.map((c) => c.path));
  });
});
