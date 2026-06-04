import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildEvidencePack } from "../../src/bench/evidence-pack/builder.js";

const FIXTURE = join(__dirname, "..", "..", ".tmp", "builder");

describe("buildEvidencePack", () => {
  beforeAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    await mkdir(join(FIXTURE, "src"), { recursive: true });
    await writeFile(join(FIXTURE, "package.json"), '{"name":"x","version":"1.0.0"}');
    await writeFile(join(FIXTURE, "AGENTS.md"), "# Agents\n\n" + "- rule\n".repeat(10));
    await writeFile(join(FIXTURE, "src", "Box.tsx"), "export const Box = () => null;");
  });

  it("emits an EvidencePack with the documented schemaVersion", async () => {
    const pack = await buildEvidencePack({
      repoRoot: FIXTURE,
      owner: "test-owner",
      name: "test-repo",
      headSha: "deadbeef",
      lyseCliVersion: "0.1.0-test",
      extractedAt: "2026-05-26T00:00:00.000Z",
    });
    expect(pack.schemaVersion).toBe("bench-pack/1.0");
    expect(pack.repo.owner).toBe("test-owner");
    expect(pack.repo.headSha).toBe("deadbeef");
    expect(pack.manifests.agentsMd.present).toBe(true);
    expect(pack.packageJsonDigest.root?.name).toBe("x");
  });

  it("produces JSON with alphabetically sorted top-level keys (determinism)", async () => {
    const pack = await buildEvidencePack({
      repoRoot: FIXTURE,
      owner: "o", name: "n", headSha: "x",
      lyseCliVersion: "v", extractedAt: "2026-05-26T00:00:00.000Z",
    });
    const json = JSON.stringify(pack);
    const keys = Object.keys(pack);
    expect(keys).toEqual([...keys].sort());
    expect(json.length).toBeGreaterThan(100);
  });
});
