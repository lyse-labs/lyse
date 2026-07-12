import { basename } from "node:path";
import { auditDirectory, RefuseToRunError } from "./audit-pipeline.js";
import { runHandoff, spawnAgentLauncher } from "../agent/handoff.js";
import { isInteractive as defaultIsInteractive, choice } from "../menu/prompts.js";
import type { HandoffResult } from "../agent/handoff.js";

export interface HandoffDeps {
  isInteractive?: () => boolean;
  prompt?: (choices: { value: string; label: string }[]) => Promise<string | null>;
  launch?: (agentId: string, prompt: string, cwd: string) => Promise<number>;
}

async function defaultPrompt(
  choices: { value: string; label: string }[],
): Promise<string | null> {
  const mapped = choices.map((c) => ({ title: c.label, value: c.value }));
  const result = await choice("Hand off findings to your agent:", mapped);
  return result ?? null;
}

export async function runHandoffCommand(root: string, deps?: HandoffDeps): Promise<void> {
  const checkInteractive = deps?.isInteractive ?? defaultIsInteractive;

  if (!checkInteractive()) {
    process.stdout.write(
      "`lyse handoff` needs an interactive terminal; run it locally\n",
    );
    return;
  }

  let auditResult: Awaited<ReturnType<typeof auditDirectory>>;
  try {
    auditResult = await auditDirectory(root);
  } catch (err) {
    if (err instanceof RefuseToRunError) {
      console.error(`[lyse] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const { result, tokens, config } = auditResult;
  const projectName = basename(root) || "project";

  const prompt = deps?.prompt ?? defaultPrompt;
  const launch = deps?.launch ?? spawnAgentLauncher;

  const handoffResult: HandoffResult = await runHandoff(
    {
      findings: result.findings,
      tokens,
      root,
      projectName,
      ...(config.advisory?.migrationScaleFileCount !== undefined
        ? { migrationScaleFileCount: config.advisory.migrationScaleFileCount }
        : {}),
    },
    { prompt, launch },
  );

  switch (handoffResult.action) {
    case "launched":
      process.stdout.write(`Agent launched: ${handoffResult.agentId ?? "unknown"}\n`);
      break;
    case "copied":
      process.stdout.write("Prompt copied to clipboard.\n");
      break;
    case "copy-failed":
      process.stderr.write(
        "Clipboard unavailable — the handoff prompt is saved at .lyse/handoff/ (findings.json + tokens.json).\n",
      );
      break;
    case "skipped":
      process.stdout.write("Handoff skipped.\n");
      break;
    case "none":
      process.stdout.write("No findings to hand off.\n");
      break;
  }
}
