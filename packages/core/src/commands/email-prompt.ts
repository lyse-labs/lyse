import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import prompts from "prompts";
import { VERSION } from "../index.js";

/**
 * `~/.lyse/profile.json` records the once-per-machine opt-in decision so we
 * never re-prompt. After a 2xx from the Worker the email itself is dropped
 * locally (only `sentAt` survives); if delivery failed we keep the email
 * locally so the next audit can retry.
 */
export type ProfileFile =
  | { email: string; createdAt: string; lyseVersion: string; sentAt?: string }
  | { declined: true; declinedAt: string; lyseVersion: string };

const EMAIL_RFC5322_LITE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_WORKER_ENDPOINT = "https://api.getlyse.com/v1/profile/email";
const DEFAULT_POST_TIMEOUT_MS = 2000;

export function workerEmailEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  return env["LYSE_EMAIL_ENDPOINT"] ?? DEFAULT_WORKER_ENDPOINT;
}

export function isValidEmail(input: string): boolean {
  return EMAIL_RFC5322_LITE.test(input);
}

export function profilePath(homeDir: string = homedir()): string {
  return join(homeDir, ".lyse", "profile.json");
}

export function hasProfileDecision(homeDir: string = homedir()): boolean {
  return existsSync(profilePath(homeDir));
}

export function readProfile(homeDir: string = homedir()): ProfileFile | null {
  const path = profilePath(homeDir);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      if (typeof o["email"] === "string" && typeof o["createdAt"] === "string") {
        return parsed as ProfileFile;
      }
      if (o["declined"] === true && typeof o["declinedAt"] === "string") {
        return parsed as ProfileFile;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function shouldPromptForEmail(
  opt: { yes?: boolean },
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = process.stdout.isTTY ?? false,
  homeDir: string = homedir(),
): boolean {
  if (opt.yes) return false;
  if (env["LYSE_NO_EMAIL_PROMPT"] === "1") return false;
  if (env["CI"] === "1" || env["CI"] === "true") return false;
  if (!isTTY) return false;
  if (hasProfileDecision(homeDir)) return false;
  return true;
}

export function buildProfile(email: string, now: Date = new Date()): ProfileFile {
  return { email, createdAt: now.toISOString(), lyseVersion: VERSION };
}

export function buildDeclinedProfile(now: Date = new Date()): ProfileFile {
  return { declined: true, declinedAt: now.toISOString(), lyseVersion: VERSION };
}

export async function persistProfile(profile: ProfileFile, homeDir: string = homedir()): Promise<string> {
  const dir = join(homeDir, ".lyse");
  const path = join(dir, "profile.json");
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(profile, null, 2) + "\n");
  return path;
}

export async function postEmailToWorker(
  email: string,
  opt: { endpoint?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<boolean> {
  const env = opt.env ?? process.env;
  if (env["LYSE_NO_EMAIL_POST"] === "1") return false;
  const endpoint = opt.endpoint ?? workerEmailEndpoint(env);
  const timeoutMs = opt.timeoutMs ?? DEFAULT_POST_TIMEOUT_MS;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        lyseVersion: VERSION,
        capturedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncPendingEmail(homeDir: string = homedir()): Promise<"sent" | "skipped" | "failed"> {
  const profile = readProfile(homeDir);
  if (!profile) return "skipped";
  if ("declined" in profile) return "skipped";
  if (profile.sentAt) return "skipped";
  const ok = await postEmailToWorker(profile.email);
  if (!ok) return "failed";
  try {
    await persistProfile({ ...profile, sentAt: new Date().toISOString() }, homeDir);
    return "sent";
  } catch {
    return "failed";
  }
}

export async function maybePromptForEmail(opt: { yes?: boolean }): Promise<void> {
  if (!shouldPromptForEmail(opt)) return;

  const r = await prompts({
    type: "text",
    name: "email",
    message: "Get release & security updates? Type your email (Enter to skip):",
  });
  const raw = typeof r.email === "string" ? r.email.trim() : "";

  if (!raw) {
    try {
      await persistProfile(buildDeclinedProfile());
    } catch {
      // ignore
    }
    return;
  }

  if (!isValidEmail(raw)) {
    console.log("  ⚠ That doesn't look like a valid email — skipping.\n");
    try {
      await persistProfile(buildDeclinedProfile());
    } catch {
      // ignore
    }
    return;
  }

  try {
    await persistProfile(buildProfile(raw));
  } catch (err) {
    console.log(`  ⚠ Couldn't save email locally: ${(err as Error).message}\n`);
    return;
  }

  const ok = await postEmailToWorker(raw);
  if (ok) {
    try {
      await persistProfile({ ...buildProfile(raw), sentAt: new Date().toISOString() });
    } catch {
      // re-POST on next audit
    }
    console.log("  ✓ Thanks — you'll get release & security updates.\n");
  } else {
    console.log("  ✓ Saved. We'll retry sending on the next audit.\n");
  }
}
