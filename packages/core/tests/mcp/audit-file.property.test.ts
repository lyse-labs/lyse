import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { runAuditFile } from "../../src/mcp/tools/audit-file.js";

/**
 * Fuzz/property hardening (#104) of the agent-facing entry point. `audit_file`
 * runs the full parse → all single-file rules → score path on whatever buffer a
 * coding agent throws at it (including in-progress, syntactically-broken code).
 * It must be TOTAL: never throw, always return a well-formed result. A rule that
 * crashes on adversarial input would take the whole MCP tool down.
 */

const TSX_CHARS = "<>/{}()=>;:\"'`.,abcDIV svg style background#0xfff @[]\n\t".split("");
const CSS_CHARS = "{}:;.#%()/* */abc0px#fff @media calc var(--x)\n\t".split("");

const tsxContent = fc.array(fc.constantFrom(...TSX_CHARS), { maxLength: 500 }).map((a) => a.join(""));
const cssContent = fc.array(fc.constantFrom(...CSS_CHARS), { maxLength: 500 }).map((a) => a.join(""));

const VALID = {
  schema_version: "1.0.0",
};

function wellFormed(r: Awaited<ReturnType<typeof runAuditFile>>): boolean {
  return (
    r.schema_version === VALID.schema_version &&
    Array.isArray(r.violations) &&
    r.violations.every(
      (v) =>
        typeof v.rule_id === "string" &&
        ["error", "warning", "info"].includes(v.severity) &&
        typeof v.range?.line === "number" &&
        typeof v.range?.column === "number" &&
        typeof v.message === "string",
    )
  );
}

describe("audit_file — fuzz/property hardening (#104)", () => {
  it("never throws and always returns a well-formed result on adversarial TSX", async () => {
    await fc.assert(
      fc.asyncProperty(tsxContent, async (content) => {
        const r = await runAuditFile({ path: "Fuzz.tsx", content });
        return wellFormed(r);
      }),
      { numRuns: 60 },
    );
  });

  it("never throws and always returns a well-formed result on adversarial CSS", async () => {
    await fc.assert(
      fc.asyncProperty(cssContent, async (content) => {
        const r = await runAuditFile({ path: "fuzz.css", content });
        return wellFormed(r);
      }),
      { numRuns: 60 },
    );
  });

  it("is deterministic — same buffer audited twice gives the same violations", async () => {
    await fc.assert(
      fc.asyncProperty(tsxContent, async (content) => {
        const a = await runAuditFile({ path: "Fuzz.tsx", content });
        const b = await runAuditFile({ path: "Fuzz.tsx", content });
        return JSON.stringify(a.violations) === JSON.stringify(b.violations);
      }),
      { numRuns: 40 },
    );
  });

  it("handles empty + whitespace-only buffers without throwing", async () => {
    for (const content of ["", " ", "\n\n\n", "\t"]) {
      const r = await runAuditFile({ path: "x.tsx", content });
      expect(wellFormed(r)).toBe(true);
    }
  });
});
