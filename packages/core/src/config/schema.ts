/**
 * Zod schema for .lyse.yaml — addresses T2 security gap:
 * both loadConfig sites previously cast YAML via `as` without validation.
 *
 * Structurally compatible with LyseConfig in ../types.ts.
 * The schema intentionally does NOT use .strict() so future fields in
 * .lyse.yaml don't cause hard failures — unknown keys are stripped silently.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { LyseConfig } from "../types.js";
export type { LyseConfig } from "../types.js";

export const LyseConfigSchema = z.object({
  designSystem: z
    .object({
      componentsModule: z.string().optional(),
      elements: z.record(z.string(), z.string()).optional(),
      excludePaths: z.array(z.string()).optional(),
    })
    // YAML `designSystem:` with no value parses as null — treat as "not set".
    .nullish()
    .transform((v) => v ?? undefined),
  rules: z
    .record(
      z.string(),
      z.union([
        z.literal("off"),
        z.object({
          severity: z.enum(["error", "warning", "info", "off"]).optional(),
          tolerance: z.number().optional(),
          disable: z.array(z.string()).optional(),
        }),
      ]),
    )
    .optional(),
  scoring: z
    .object({
      // Early-adopter grace ramp (#89 / ADR-0018): the ai-governance axis
      // weighs `min(1, aiMarkerCount / window)`. A nascent AI surface (1 marker)
      // is graced so adding one AIBadge doesn't crater a healthy score. Set 1 to
      // disable the ramp. Default 5.
      aiGovernanceGraceWindow: z.number().int().min(1).optional(),
    })
    .nullish()
    .transform((v) => v ?? undefined),
  i18n: z
    .object({
      locales: z.array(z.string()).optional(),
      vocabulary: z
        .object({
          aiNouns: z.array(z.string()).optional(),
          disclaimerPhrases: z.array(z.string()).optional(),
          controlLabels: z.array(z.string()).optional(),
          gatePhrases: z.array(z.string()).optional(),
          loadingPhrases: z.array(z.string()).optional(),
        })
        .optional(),
    })
    // YAML `i18n:` with no value parses as null — treat as "not set".
    .nullish()
    .transform((v) => v ?? undefined),
  llm: z
    .object({
      provider: z
        .enum(["anthropic", "openai", "openai-compatible", "mcp", "none", "auto", "agent-cli"])
        .optional(),
      model: z.string().optional(),
      endpoint: z.string().optional(),
      // ADR-0015: ConnectorResolver fields (Task 2)
      connector: z
        .enum(["auto", "mcp-host", "openrouter", "direct-api-key", "ollama", "agent-cli"])
        .optional(),
      costCapUsd: z.number().positive().optional(),
      cacheMaxAgeDays: z.number().positive().optional(),
      staticOnly: z.boolean().optional(),
    })
    .optional(),
  // Advisory-only tuning — does not affect the Health Score. Overrides
  // MIGRATION_SCALE_FILE_COUNT_DEFAULT (40) used to flag large fix groups
  // in meta.projection (Sprint 1 actionable findings).
  advisory: z
    .object({
      migrationScaleFileCount: z.number().int().min(2).optional(),
    })
    .optional(),
});

export type LyseConfigValidated = z.infer<typeof LyseConfigSchema>;

/**
 * Validate raw YAML output as a LyseConfig without throwing.
 * Returns { ok: true, value } on success or { ok: false, error } with a
 * semicolon-separated list of validation issues on failure.
 */
export function safeParseLyseConfig(
  raw: unknown,
): { ok: true; value: LyseConfigValidated } | { ok: false; error: string } {
  const result = LyseConfigSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; "),
  };
}

export interface LoadConfigOptions {
  /**
   * Error handling strategy:
   * - "throw" (default): throw on invalid YAML or Zod validation failure.
   * - "degrade": log to stderr and return empty config on any error.
   */
  onError?: "throw" | "degrade";
}

/**
 * Load and validate .lyse.yaml for a given repository root.
 *
 * Respects the LYSE_CONFIG_PATH env var (set by --config flag) to override
 * the default `.lyse.yaml` discovery path.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @param opts     - Options. Default: { onError: "throw" }.
 */
export function loadConfig(repoRoot: string, opts?: LoadConfigOptions): LyseConfig {
  const onError = opts?.onError ?? "throw";
  // LYSE_CONFIG_PATH (set by --config flag) overrides .lyse.yaml discovery.
  const configPath = process.env.LYSE_CONFIG_PATH ?? join(repoRoot, ".lyse.yaml");
  try {
    const raw: unknown = parseYaml(readFileSync(configPath, "utf8"));
    const parsed = safeParseLyseConfig(raw);
    if (!parsed.ok) {
      const msg = `[lyse] Warning: Invalid .lyse.yaml: ${parsed.error}\n`;
      if (onError === "degrade") {
        process.stderr.write(msg);
        return {};
      }
      // Hard-fail: invalid .lyse.yaml should never produce a misleading audit.
      throw new Error(`Invalid .lyse.yaml: ${parsed.error}`);
    }
    const value = parsed.value as LyseConfig;
    // Migration: llm.provider: 'none' was removed in v0.1.
    // Treat it as llm.staticOnly: true and warn the user.
    if ((value.llm as Record<string, unknown> | undefined)?.provider === "none") {
      process.stderr.write(
        "[Lyse] DEPRECATION: llm.provider: 'none' is removed in v0.1. " +
          "Treating as llm.staticOnly: true. Please update .lyse.yaml.\n",
      );
      const llmFixed: Record<string, unknown> = { ...(value.llm as Record<string, unknown>), staticOnly: true };
      delete llmFixed.provider;
      (value as Record<string, unknown>).llm = llmFixed;
    }
    return value;
  } catch (err) {
    // Re-throw validation errors in throw mode
    if (err instanceof Error && err.message.startsWith("Invalid .lyse.yaml")) {
      if (onError === "degrade") {
        process.stderr.write(`[lyse] Warning: ${err.message}\n`);
        return {};
      }
      throw err;
    }
    // File missing / unreadable → safe default (no config) in both modes.
    return {};
  }
}

/**
 * Resolve where the .lyse.yaml WOULD be loaded from for this repo root, if at all.
 * Returns the absolute path when a config file is discoverable, or `null` when
 * no config file is present. Does NOT parse or validate the contents.
 *
 * Mirrors the discovery logic of `loadConfig` (LYSE_CONFIG_PATH > .lyse.yaml at root)
 * so the value reported in `AuditResult.meta.coverage.configPath` matches the file
 * `loadConfig` would actually read.
 */
export function resolveConfigPath(repoRoot: string): string | null {
  const candidate = process.env.LYSE_CONFIG_PATH ?? join(repoRoot, ".lyse.yaml");
  return existsSync(candidate) ? candidate : null;
}
