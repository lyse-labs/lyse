import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import type { Detected } from "./types.js";

const exec = promisify(execCb);

async function gitOrNull(cmd: string, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec(`git ${cmd}`, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function detectFromGit(rootDir: string): Promise<Pick<Detected, "git" | "github">> {
  const isRepo = await gitOrNull("rev-parse --is-inside-work-tree", rootDir);
  if (isRepo !== "true") {
    return {
      git: {
        value: { initialized: false, hasRemote: false, isClean: true, branch: null, defaultBranch: null },
        confidence: "high",
        source: "not a git repository",
      },
      github: { value: null, confidence: "high", source: "no git repository" },
    };
  }

  const status = await gitOrNull("status --porcelain", rootDir);
  const branch = await gitOrNull("rev-parse --abbrev-ref HEAD", rootDir);
  const remoteUrl = await gitOrNull("remote get-url origin", rootDir);
  const hasRemote = remoteUrl !== null;

  let defaultBranch: string | null = null;
  if (hasRemote) {
    const symRef = await gitOrNull("symbolic-ref refs/remotes/origin/HEAD", rootDir);
    defaultBranch = symRef ? symRef.replace("refs/remotes/origin/", "") : "main";
  }

  const github = parseGitHubUrl(remoteUrl);

  return {
    git: {
      value: { initialized: true, hasRemote, isClean: status === "", branch, defaultBranch },
      confidence: "high",
      source: "git commands",
    },
    github: github
      ? { value: github, confidence: "high", source: `git remote origin: ${remoteUrl}` }
      : { value: null, confidence: "high", source: hasRemote ? "remote is not GitHub" : "no remote configured" },
  };
}

function parseGitHubUrl(url: string | null): { owner: string; repo: string } | null {
  if (!url) return null;
  // Matches https://github.com/owner/repo[.git] and git@github.com:owner/repo[.git]
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  return m ? { owner: m[1] as string, repo: m[2] as string } : null;
}
