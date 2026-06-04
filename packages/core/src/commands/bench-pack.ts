import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildEvidencePack } from "../bench/evidence-pack/builder.js";
import { VERSION } from "../index.js";

export interface RunBenchPackOptions {
  cwd: string;
  output: string;
}

function resolveHeadSha(repoRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function readPackageJsonName(repoRoot: string): Promise<string | null> {
  try {
    const raw = await readFile(join(repoRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: string };
    if (typeof parsed.name === "string" && parsed.name.length > 0) return parsed.name;
  } catch {
    // ignore
  }
  return null;
}

async function resolveOwnerName(repoRoot: string): Promise<{ owner: string; name: string }> {
  // package.json `name` is the most reliable identifier when the bench pack is
  // produced from a non-git fixture or a subdirectory whose parent git repo is
  // not the package under audit. When present, it wins over the parsed remote.
  const pkgName = await readPackageJsonName(repoRoot);
  try {
    const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const match = remote.match(/[:/]([^/]+)\/([^/.]+?)(\.git)?$/);
    if (match) {
      return { owner: match[1] ?? "unknown", name: pkgName ?? match[2] ?? "unknown" };
    }
  } catch {
    // fallthrough
  }
  if (pkgName !== null) return { owner: "unknown", name: pkgName };
  return { owner: "unknown", name: basename(repoRoot) };
}

export async function runBenchPack(opts: RunBenchPackOptions): Promise<void> {
  const repoRoot = resolve(opts.cwd);
  const headSha = resolveHeadSha(repoRoot);
  const ownerName = await resolveOwnerName(repoRoot);
  const pack = await buildEvidencePack({
    repoRoot,
    owner: ownerName.owner,
    name: ownerName.name,
    headSha,
    lyseCliVersion: VERSION,
    extractedAt: new Date().toISOString(),
  });

  await mkdir(dirname(resolve(opts.output)), { recursive: true });
  await writeFile(resolve(opts.output), JSON.stringify(pack), "utf8");
  console.log(`bench-pack: wrote ${opts.output}`);
}
