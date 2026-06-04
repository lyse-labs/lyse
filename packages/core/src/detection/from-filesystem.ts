import { access, constants } from "node:fs";
import { join } from "node:path";
import type { Detected } from "./types.js";

async function exists(p: string): Promise<boolean> {
  return new Promise((resolve) => {
    access(p, constants.F_OK, (err) => {
      resolve(!err);
    });
  });
}

export async function detectFromFilesystem(rootDir: string): Promise<Pick<Detected, "cursor" | "claudeCode">> {
  const cursorExists = await exists(join(rootDir, ".cursor"));
  const claudeExists = await exists(join(rootDir, ".mcp.json"));

  return {
    cursor: {
      value: cursorExists,
      confidence: "high",
      source: cursorExists ? ".cursor/ directory present" : ".cursor/ directory absent",
    },
    claudeCode: {
      value: claudeExists,
      confidence: "high",
      source: claudeExists ? ".mcp.json present" : ".mcp.json absent",
    },
  };
}
