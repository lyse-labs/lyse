import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditTest, LYSE_CLI_PATH } from "./_helpers/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = LYSE_CLI_PATH;
const fixture = join(__dirname, "../fixtures/full-ds");

describe("cli --format=sarif", () => {
  it("emits SARIF JSON to stdout (no --output)", () => {
    const out = execSync(`node ${cli} audit ${fixture} --static-only --format sarif`, { encoding: "utf8" });
    const sarif = JSON.parse(out);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.name).toBe("Lyse");
  });

  it("writes lyse.sarif when --output given", () => {
    const tmp = `/tmp/lyse-sarif-${Date.now()}`;
    execSync(`node ${cli} audit ${fixture} --static-only --format sarif --output ${tmp}`, { stdio: "inherit" });
    const file = join(tmp, "lyse.sarif");
    expect(existsSync(file)).toBe(true);
    const sarif = JSON.parse(readFileSync(file, "utf8"));
    expect(sarif.version).toBe("2.1.0");
  });

  it("exit code 0 on success even with findings (no threshold)", () => {
    const r = runAuditTest({ path: fixture, format: "sarif" });
    expect(r.status).toBe(0);
  });
});
