import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatMessage, ConnectorResult } from "./types.js";

export const DEFAULT_CACHE_DIR = join(homedir(), ".cache", "lyse", "llm-responses");

interface CacheEntry {
  timestamp: string;
  result: Omit<ConnectorResult, "cacheHit" | "usdSpent">;
}

export class ResponseCache {
  constructor(
    private readonly opts: { cacheDir: string; maxAgeDays: number },
  ) {}

  private cacheKey(model: string, messages: ChatMessage[]): string {
    const payload = JSON.stringify({ model, messages });
    return createHash("sha256").update(payload).digest("hex");
  }

  private entryPath(key: string): string {
    return join(this.opts.cacheDir, `${key}.json`);
  }

  private isExpired(timestamp: string): boolean {
    const ageMs = Date.now() - new Date(timestamp).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays >= this.opts.maxAgeDays;
  }

  async get(model: string, messages: ChatMessage[]): Promise<ConnectorResult | null> {
    const path = this.entryPath(this.cacheKey(model, messages));
    if (!existsSync(path)) return null;
    try {
      const entry = JSON.parse(readFileSync(path, "utf8")) as CacheEntry;
      if (this.isExpired(entry.timestamp)) return null;
      return {
        ...entry.result,
        cacheHit: true,
        usdSpent: 0,
      };
    } catch {
      return null;
    }
  }

  async set(model: string, messages: ChatMessage[], result: ConnectorResult): Promise<void> {
    mkdirSync(this.opts.cacheDir, { recursive: true });
    const entry: CacheEntry = {
      timestamp: new Date().toISOString(),
      result: {
        text: result.text,
        modelUsed: result.modelUsed,
        llmQuality: result.llmQuality,
      },
    };
    writeFileSync(this.entryPath(this.cacheKey(model, messages)), JSON.stringify(entry));
  }
}

export function defaultResponseCache(maxAgeDays: number): ResponseCache {
  return new ResponseCache({ cacheDir: DEFAULT_CACHE_DIR, maxAgeDays });
}
