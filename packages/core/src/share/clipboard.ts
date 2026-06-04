import { spawn } from "node:child_process";

/**
 * Linux clipboard candidates, tried in order.
 * 1. wl-copy  — Wayland (most modern desktops)
 * 2. xclip    — X11, widely available
 * 3. xsel     — X11, alternative to xclip
 */
export const LINUX_CLIPBOARD_CANDIDATES: { cmd: string; args: string[] }[] = [
  { cmd: "wl-copy", args: [] },
  { cmd: "xclip", args: ["-selection", "clipboard"] },
  { cmd: "xsel", args: ["--clipboard", "--input"] },
];

/**
 * Spawn a clipboard command, write text to its stdin, and resolve when it exits 0.
 * Rejects if the process errors or exits non-zero.
 */
export async function trySpawn(cmd: string, args: string[], text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

/**
 * Try each Linux clipboard candidate in order (wl-copy → xclip → xsel).
 * Throws if none succeed, reporting the last error.
 */
async function copyToClipboardLinux(text: string): Promise<void> {
  let lastErr: Error | undefined;
  for (const { cmd, args } of LINUX_CLIPBOARD_CANDIDATES) {
    try {
      await trySpawn(cmd, args, text);
      return;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  const tried = LINUX_CLIPBOARD_CANDIDATES.map((c) => c.cmd).join(", ");
  throw new Error(`No clipboard utility found. Tried: ${tried}. Last error: ${lastErr?.message}`);
}

export async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform;

  if (platform === "darwin") {
    return trySpawn("pbcopy", [], text);
  } else if (platform === "win32") {
    return trySpawn("clip", [], text);
  } else {
    // Linux / other POSIX: try wl-copy → xclip → xsel
    return copyToClipboardLinux(text);
  }
}

export function formatShareMarkdown(
  score: number | "N/A",
  axes: { tokens: number | null; a11y: number | null; components: number | null; stories: number | null },
  topRules: { ruleId: string; count: number; fixable: boolean }[],
  repo: string | null
): string {
  const lines: string[] = [`**Lyse Health Score: ${score}/100**`, ""];
  lines.push("| Axis | Score |", "|---|---|");
  for (const [k, v] of Object.entries(axes)) {
    lines.push(`| ${k} | ${v ?? "N/A"} |`);
  }
  lines.push("", "**Top findings:**");
  for (const r of topRules.slice(0, 5)) {
    lines.push(`- ${r.ruleId}: ${r.count}${r.fixable ? " (auto-fixable)" : ""}`);
  }
  if (repo) lines.push("", `Repo: ${repo}`);
  return lines.join("\n");
}
