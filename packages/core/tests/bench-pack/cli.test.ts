import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { runBenchPack } from "../../src/commands/bench-pack.js";

const FIXTURE = join(__dirname, "..", "..", ".tmp", "cli-bench-pack");
const OUTPUT = join(FIXTURE, "evidence-pack.json");

describe("runBenchPack", () => {
  beforeAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    await mkdir(join(FIXTURE, "src"), { recursive: true });
    await writeFile(join(FIXTURE, "package.json"), '{"name":"sample","version":"1.0.0"}');
    await writeFile(join(FIXTURE, "AGENTS.md"), "# Agents\n\n" + "- rule\n".repeat(10));
    await writeFile(join(FIXTURE, "src", "Box.tsx"), "export const Box = () => null;");
  });

  it("writes a valid EvidencePack JSON to the output path", async () => {
    await runBenchPack({ cwd: FIXTURE, output: OUTPUT });
    const raw = await readFile(OUTPUT, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.schemaVersion).toBe("bench-pack/1.0");
    expect(parsed.repo.name).toBe("sample");
    expect(parsed.manifests.agentsMd.present).toBe(true);
  });

  it("prints output path to stdout for downstream consumption", async () => {
    const origLog = console.log;
    const lines: string[] = [];
    console.log = (msg: string) => lines.push(msg);
    try {
      await runBenchPack({ cwd: FIXTURE, output: OUTPUT });
    } finally {
      console.log = origLog;
    }
    expect(lines.some((l) => l.includes("evidence-pack.json"))).toBe(true);
  });
});
