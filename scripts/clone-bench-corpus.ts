import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export interface BenchEntry {
  repo: string;
  url: string;
  sha: string;
}

export function parseBenchYaml(yamlText: string): BenchEntry[] {
  const raw = parse(yamlText) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("repo" in item) ||
      !("url" in item) ||
      !("sha" in item)
    ) {
      return [];
    }
    const { repo, url, sha } = item as Record<string, unknown>;
    if (
      typeof repo !== "string" ||
      typeof url !== "string" ||
      typeof sha !== "string"
    ) {
      return [];
    }
    return [{ repo, url, sha }];
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const tierIdx = args.indexOf("--tier");
  const tier = tierIdx !== -1 ? (args[tierIdx + 1] ?? "1") : "1";
  const destIdx = args.indexOf("--dest");
  const dest = destIdx !== -1 ? (args[destIdx + 1] ?? ".bench-corpus") : ".bench-corpus";

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const benchYamlPath = resolve(repoRoot, `../lyse-bench/corpus/tier${tier}.yaml`);

  if (!existsSync(benchYamlPath)) {
    console.error(
      `bench corpus not found: ${benchYamlPath}\n` +
        `Clone lyse-bench next to this repo: git clone https://github.com/lyse-labs/lyse-bench ../lyse-bench`
    );
    process.exit(1);
  }

  const yamlText = readFileSync(benchYamlPath, "utf-8");
  const entries = parseBenchYaml(yamlText);
  const destAbs = resolve(repoRoot, dest);

  let cloned = 0;
  let skipped = 0;

  for (const entry of entries) {
    const leaf = entry.repo.split("/").pop() ?? entry.repo.replace("/", "__");
    const entryDest = resolve(destAbs, leaf);

    if (existsSync(entryDest)) {
      console.log(`skip  ${entry.repo} (already present)`);
      skipped++;
      continue;
    }

    console.log(`clone ${entry.repo} @ ${entry.sha.slice(0, 8)}`);
    execFileSync(
      "git",
      ["clone", "--filter=blob:none", "--no-checkout", entry.url, entryDest],
      { stdio: "inherit" }
    );
    execFileSync("git", ["-C", entryDest, "checkout", entry.sha], {
      stdio: "inherit",
    });
    cloned++;
  }

  console.log(`\ndone: ${cloned} cloned, ${skipped} skipped`);
}

// Only run when executed directly (not when imported by tests)
if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
