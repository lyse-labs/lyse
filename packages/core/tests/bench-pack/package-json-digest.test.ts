import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildPackageJsonDigest } from "../../src/bench/evidence-pack/package-json-digest.js";

const FIXTURE = join(__dirname, "..", "..", ".tmp", "pkg-digest");

describe("buildPackageJsonDigest", () => {
  beforeAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    await mkdir(join(FIXTURE, "packages", "ui"), { recursive: true });
    await writeFile(
      join(FIXTURE, "package.json"),
      JSON.stringify({
        name: "monorepo",
        version: "1.0.0",
        scripts: { build: "tsc", test: "vitest" },
        dependencies: { react: "^18" },
        devDependencies: { typescript: "^5" },
      }),
    );
    await writeFile(
      join(FIXTURE, "packages", "ui", "package.json"),
      JSON.stringify({
        name: "@scope/ui",
        version: "0.1.0",
        scripts: { build: "tsup" },
        dependencies: {},
        exports: { ".": "./dist/index.js" },
      }),
    );
  });

  it("extracts root package.json into root digest", async () => {
    const d = await buildPackageJsonDigest(FIXTURE);
    expect(d.root).not.toBeNull();
    expect(d.root?.name).toBe("monorepo");
    expect(d.root?.scripts).toEqual(["build", "test"]);
    expect(d.root?.deps).toEqual(["react"]);
    expect(d.root?.devDeps).toEqual(["typescript"]);
  });

  it("discovers subpackages and extracts their package.json", async () => {
    const d = await buildPackageJsonDigest(FIXTURE);
    expect(d.subpackages).toHaveLength(1);
    expect(d.subpackages[0]?.path).toBe("packages/ui");
    expect(d.subpackages[0]?.name).toBe("@scope/ui");
    expect(d.subpackages[0]?.exports).toEqual({ ".": "./dist/index.js" });
  });

  it("returns alphabetically sorted scripts/deps/devDeps for determinism", async () => {
    const d = await buildPackageJsonDigest(FIXTURE);
    expect(d.root?.scripts).toEqual([...d.root!.scripts].sort());
    expect(d.root?.deps).toEqual([...d.root!.deps].sort());
    expect(d.root?.devDeps).toEqual([...d.root!.devDeps].sort());
  });
});
