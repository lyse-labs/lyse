import { detectFromPackageJson } from "./from-package-json.js";
import { detectFromFilesystem } from "./from-filesystem.js";
import { detectFromGit } from "./from-git.js";
import type { Detected } from "./types.js";

export async function runPreFlight(rootDir: string, opts?: { skipNodeCheck?: boolean }): Promise<Detected> {
  if (!opts?.skipNodeCheck) {
    enforceNodeVersion();
  }
  const [pkg, fs, git] = await Promise.all([
    detectFromPackageJson(rootDir),
    detectFromFilesystem(rootDir),
    detectFromGit(rootDir),
  ]);
  return { ...pkg, ...fs, ...git };
}

function enforceNodeVersion(): void {
  if (process.env.LYSE_SKIP_NODE_CHECK === "1") return;
  const major = parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < 22) {
    process.stderr.write(`\nLyse requires Node.js 22+. Got ${process.versions.node}.\n  Install via nvm: nvm install 22 && nvm use 22\n\n`);
    process.exit(64);
  }
}

export function formatDetected(d: Detected): string {
  const lines: string[] = ["Detected:"];
  if (d.framework.value && d.framework.value !== "unknown") {
    lines.push(`  ✓ Framework: ${d.framework.value}${d.hasTypeScript.value ? " + TypeScript" : ""}`);
  }
  if (d.componentsModule.value) {
    lines.push(`  ✓ Components module: ${d.componentsModule.value}`);
  }
  if (d.storybook.value) {
    lines.push("  ✓ Storybook detected");
  }
  if (d.git.value?.initialized) {
    lines.push(`  ✓ Git: ${d.git.value.branch ?? "(no branch)"}, ${d.git.value.isClean ? "clean" : "dirty"}`);
  }
  if (d.github.value) {
    lines.push(`  ✓ GitHub: ${d.github.value.owner}/${d.github.value.repo}`);
  }
  if (d.cursor.value) lines.push("  ✓ Cursor detected");
  if (d.claudeCode.value) lines.push("  ✓ Claude Code detected");
  return lines.join("\n");
}
