import { writeFile, access, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { runPreFlight, formatDetected } from "../detection/pre-flight.js";
import { wizardIntro, wizardOutro, wizardNote, wizardConfirm, wizardTask } from "../ui/wizard.js";
import { renderTerminal } from "../reporters/terminal.js";
import { auditDirectory } from "./audit-pipeline.js";
import { computeMissingScaffolds } from "../codemods/scaffold.js";
import { migrateLegacyTokensToDtcg } from "../codemods/migrate-tokens-dtcg.js";
import { runMcpSetup } from "./mcp-setup.js";
import { maybePromptForEmail } from "./email-prompt.js";
import { appendAuditEvent, appendInitStepCompletedEvent } from "../history/ndjson-store.js";
import { ensureLyseGitignore } from "../util/lyse-gitignore.js";
import { VERSION } from "../index.js";
import type { AxisScore } from "../types.js";
import { detectStack } from "./init-detect.js";
import { writeLyseMd } from "./init-write-lyse-md.js";
import { writeAgentsMd } from "./init-write-agents-md.js";

export interface InitOptions {
  cwd: string;
  yes?: boolean | undefined;
  /** Skip Node.js version check (used in tests running on Node < 22). */
  skipNodeCheck?: boolean | undefined;
  /** Generate missing AI-readiness files (llms.txt, AGENTS.md). */
  scaffold?: boolean | undefined;
  /** Migrate legacy ({ value, type }) token JSON files to DTCG ({ $value, $type }). */
  migrateTokens?: boolean | undefined;
}

export async function runInit(opt: InitOptions): Promise<void> {
  wizardIntro("lyse init");

  // 1. Pre-flight + detection
  const detected = await runPreFlight(opt.cwd, opt.skipNodeCheck ? { skipNodeCheck: true } : undefined);
  wizardNote(formatDetected(detected), "Stack detected");
  await appendInitStepCompletedEvent(opt.cwd, "detection");

  // 2. Confirm
  if (!opt.yes) {
    const ok = await wizardConfirm("Proceed with this configuration?", true);
    if (!ok) {
      wizardOutro("Aborted.");
      return;
    }
  }

  // 3. Write .lyse.yaml
  await writeLyseYaml(opt.cwd, detected);

  // 4. Update .gitignore
  await ensureLyseGitignore(opt.cwd);

  // 5. Run first audit (static-only — Layer 4 is a no-op stub in v0.1).
  const pipeline = await wizardTask("Running first audit…", "Audit complete", () =>
    auditDirectory(opt.cwd, { staticOnly: true }),
  );
  const result = pipeline.result;
  await appendInitStepCompletedEvent(opt.cwd, "audit");

  // 6. Append history — map AxisScore[] to the flat structure appendAuditEvent expects
  const axisScore = (name: string): number | null => {
    const found = result.axes.find((a: AxisScore) => a.axis === name);
    return typeof found?.score === "number" ? found.score : null;
  };

  await appendAuditEvent(
    opt.cwd,
    {
      score: typeof result.finalScore === "number" ? result.finalScore : 0,
      axes: {
        tokens: axisScore("tokens"),
        a11y: axisScore("a11y"),
        components: axisScore("components"),
        stories: axisScore("stories"),
      },
      findings_count: result.findings.length,
    },
    null,
  );

  const reportOpts = {
    mode: "default" as const,
    color: (process.stdout.isTTY ?? false) && !(typeof process.env["NO_COLOR"] === "string" && process.env["NO_COLOR"] !== ""),
    unicode: (process.stdout.isTTY ?? false) && process.platform !== "win32",
    width: Math.min(process.stdout.columns ?? 80, 100),
    outDir: undefined,
    fileCount: 0,
    durationMs: 0,
    cwd: opt.cwd,
    hasTokenRegistry: !!pipeline.config.designSystem?.componentsModule,
    findingsLimit: 5,
    suppressNags: true,
  };
  process.stdout.write((await renderTerminal(result, reportOpts)) + "\n");

  // 6b. Bootstrap AI-readiness surface: LYSE.md + AGENTS.md.
  await writeAiReadinessSurface(opt.cwd, pipeline);

  // 7. Optional setup extras (not code fixes — those go through `lyse handoff`):
  //    --scaffold writes missing AI-readiness files; --migrate-tokens converts
  //    legacy { value, type } token JSON to DTCG. Both write the working tree
  //    directly (init is setup, not the guarded fix path).
  if (opt.scaffold) {
    const missing = computeMissingScaffolds(opt.cwd);
    for (const s of missing) {
      const abs = join(opt.cwd, s.path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, s.content, "utf8");
    }
    if (missing.length > 0) {
      console.log(`  ✓ Scaffolded ${missing.length} AI-readiness file(s): ${missing.map((m) => m.path).join(", ")}\n`);
    }
  }
  if (opt.migrateTokens) {
    const plan = migrateLegacyTokensToDtcg(opt.cwd);
    for (const m of plan.migrations) {
      await writeFile(join(opt.cwd, m.path), m.content, "utf8");
    }
    if (plan.migrations.length > 0) {
      console.log(`  ✓ Migrated ${plan.migrations.length} token file(s) to DTCG: ${plan.migrations.map((m) => m.path).join(", ")}\n`);
    }
  }

  // 8. Offer MCP setup
  if (detected.cursor.value || detected.claudeCode.value) {
    const doMcp =
      opt.yes || (await wizardConfirm("Wire Lyse into your IDE (MCP)?", true));
    if (doMcp) {
      try {
        await runMcpSetup({ cwd: opt.cwd, autoApprove: opt.yes ?? false });
        await appendInitStepCompletedEvent(opt.cwd, "mcp-setup");
      } catch (err) {
        console.log(`  ⚠ MCP setup skipped: ${(err as Error).message}\n`);
      }
    }
  }

  // 9. Optional opt-in email capture for release & security updates. Skippable
  // via --yes, LYSE_NO_EMAIL_PROMPT=1, non-TTY, or just hitting Enter.
  await maybePromptForEmail({ yes: opt.yes === true });

  // 10. Summary
  wizardNote(
    "lyse audit     → re-check the score\nlyse handoff   → have your coding agent fix the findings\n\n⭐ Star the repo: github.com/lyse-labs/lyse",
    "Setup complete",
  );
  wizardOutro("You're set up.");
}

async function writeAiReadinessSurface(
  cwd: string,
  pipeline: { componentInventory: import("./audit-pipeline.js").AuditPipelineResult["componentInventory"]; config: import("./audit-pipeline.js").AuditPipelineResult["config"] },
): Promise<void> {
  const stack = detectStack(cwd);
  const componentsModule = pipeline.config.designSystem?.componentsModule ?? null;
  const lyseResult = writeLyseMd({
    repoRoot: cwd,
    stack,
    componentsModule,
    componentInventory: pipeline.componentInventory,
  });
  const agentsResult = writeAgentsMd(cwd);

  const lyseLabel = lyseResult.created ? "Created" : lyseResult.updated ? "Updated" : "Unchanged";
  console.log(`  ${lyseLabel} LYSE.md`);
  if (agentsResult.created) console.log("  Created AGENTS.md (with lyse-managed block)");
  else if (agentsResult.blockReplaced) console.log("  Updated AGENTS.md (lyse-managed block)");
  else if (agentsResult.blockAppended) console.log("  Appended lyse-managed block to AGENTS.md");
  else console.log("  AGENTS.md unchanged");
  console.log("");
}

async function writeLyseYaml(
  cwd: string,
  detected: Awaited<ReturnType<typeof runPreFlight>>,
): Promise<void> {
  const yamlPath = join(cwd, ".lyse.yaml");
  try {
    await access(yamlPath);
    return; // already exists, don't overwrite
  } catch {
    // does not exist — proceed to create
  }

  const lines: string[] = [
    `# Generated by Lyse ${VERSION} — edit if needed.`,
    "# Schema reference: https://github.com/lyse-labs/lyse/blob/main/docs/guide/configuration.md",
    "designSystem:",
  ];
  if (detected.componentsModule.value) {
    lines.push(`  componentsModule: ${JSON.stringify(detected.componentsModule.value)}`);
  }
  lines.push("excludePaths:");
  lines.push('  - "**/node_modules/**"');
  lines.push('  - "**/dist/**"');
  await writeFile(yamlPath, lines.join("\n") + "\n");
}
