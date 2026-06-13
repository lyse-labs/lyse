import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import type { ChatMessage, CompleteOptions, ConnectorClient, ConnectorResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 180_000;

export interface AgentCliSpawnInput {
  binary: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
}

export type AgentCliSpawnFn = (input: AgentCliSpawnInput) => Promise<{ text: string; usdSpent: number }>;

export interface AgentCliAdapterOptions {
  model: string;
  binary?: string;
  spawnFn?: AgentCliSpawnFn;
}

// Run from an empty tmpdir so the call is a self-contained classification of
// the inlined snippet: the CLI inherits no repo/CLAUDE.md project context,
// which keeps verdicts reproducible across machines.
const defaultSpawnFn: AgentCliSpawnFn = ({ binary, model, systemPrompt, userPrompt, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      ["--print", "--model", model, "--output-format", "json", "--system-prompt", systemPrompt],
      { stdio: ["pipe", "pipe", "pipe"], env: process.env, cwd: tmpdir() },
    );
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(() => reject(new Error(`agent-cli (${binary}) timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      settle(() => reject(new Error(`agent-cli (${binary}) spawn failed: ${e.message}`)));
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(() =>
          reject(
            new Error(
              `agent-cli (${binary}) exited ${code}: ${Buffer.concat(err).toString("utf8") || "(no stderr)"}`,
            ),
          ),
        );
        return;
      }
      settle(() => {
        try {
          const raw = Buffer.concat(out).toString("utf8");
          const parsed = JSON.parse(raw) as {
            is_error?: boolean;
            result?: string;
            total_cost_usd?: number;
          };
          if (parsed.is_error === true) throw new Error(`agent-cli (${binary}) returned is_error=true`);
          if (typeof parsed.result !== "string")
            throw new Error(`agent-cli (${binary}) response missing .result`);
          resolve({ text: parsed.result, usdSpent: parsed.total_cost_usd ?? 0 });
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
    child.stdin.write(userPrompt);
    child.stdin.end();
  });

/**
 * Check whether a given CLI binary is available on PATH.
 * Uses spawnSync with `--version` — cheap, no side effects.
 */
export function isAgentCliAvailable(binary = "claude"): boolean {
  try {
    const result = spawnSync(binary, ["--version"], {
      stdio: "pipe",
      timeout: 5_000,
    });
    return result.status === 0 && result.error === undefined;
  } catch {
    return false;
  }
}

export class AgentCliAdapter implements ConnectorClient {
  private readonly model: string;
  private readonly binary: string;
  private readonly spawnFn: AgentCliSpawnFn;
  private readonly timeoutMs: number;

  constructor(opts: AgentCliAdapterOptions) {
    this.model = opts.model;
    this.binary = opts.binary ?? process.env["LYSE_AGENT_CLI_BINARY"] ?? "claude";
    this.spawnFn = opts.spawnFn ?? defaultSpawnFn;
    this.timeoutMs = Number(process.env["LYSE_AGENT_CLI_TIMEOUT_MS"] ?? DEFAULT_TIMEOUT_MS);
  }

  async complete(messages: ChatMessage[], _opts?: CompleteOptions): Promise<ConnectorResult> {
    const systemPrompt = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const userPrompt = messages
      .filter((m) => m.role !== "system")
      .map((m) => m.content)
      .join("\n\n");

    const { text, usdSpent } = await this.spawnFn({
      binary: this.binary,
      model: this.model,
      systemPrompt,
      userPrompt,
      timeoutMs: this.timeoutMs,
    });

    return {
      text,
      usdSpent,
      modelUsed: this.model,
      llmQuality: "higher",
      cacheHit: false,
    };
  }
}
