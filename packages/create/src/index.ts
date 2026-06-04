#!/usr/bin/env node
import { spawn } from "node:child_process";

const args = ["--yes", "--package", "@lyse-labs/lyse@alpha", "lyse", "init", "--first-run"];
const child = spawn("npx", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("Failed to invoke npx:", err.message);
  process.exit(1);
});
