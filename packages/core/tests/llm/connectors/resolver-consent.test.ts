import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConnector } from "../../../src/llm/connectors/resolver.js";
import { NoopAdapter } from "../../../src/llm/connectors/noop-adapter.js";
import type { LyseConfig } from "../../../src/types.js";

const cfg: LyseConfig = {} as LyseConfig;
const available = () => true; // pretend `claude` is on PATH

// The global test setup pins LYSE_DISABLE_AGENT_AUTODETECT=1; clear it here so
// these tests exercise the CONSENT gate in isolation (not the autodetect kill
// switch).
let savedDisable: string | undefined;
beforeEach(() => {
  savedDisable = process.env["LYSE_DISABLE_AGENT_AUTODETECT"];
  delete process.env["LYSE_DISABLE_AGENT_AUTODETECT"];
});
afterEach(() => {
  if (savedDisable === undefined) delete process.env["LYSE_DISABLE_AGENT_AUTODETECT"];
  else process.env["LYSE_DISABLE_AGENT_AUTODETECT"] = savedDisable;
});

describe("resolveConnector — auto-detect consent gate (#115)", () => {
  it("auto-detect path returns Noop WITHOUT consent (closes the silent hole)", () => {
    const c = resolveConnector(cfg, {}, { agentCliAvailable: available });
    expect(c).toBeInstanceOf(NoopAdapter);
  });
  it("auto-detect path returns Noop with llmConsented:false", () => {
    const c = resolveConnector(cfg, { llmConsented: false }, { agentCliAvailable: available });
    expect(c).toBeInstanceOf(NoopAdapter);
  });
  it("auto-detect path returns a real connector with llmConsented:true", () => {
    const c = resolveConnector(cfg, { llmConsented: true }, { agentCliAvailable: available });
    expect(c).not.toBeInstanceOf(NoopAdapter);
  });
  it("explicit provider stays a deliberate opt-in (no llmConsented needed)", () => {
    const c = resolveConnector(
      { llm: { provider: "anthropic" } } as LyseConfig,
      {},
      { agentCliAvailable: available },
    );
    expect(c).not.toBeInstanceOf(NoopAdapter);
  });
  it("--static-only still hard-wins → Noop", () => {
    const c = resolveConnector(
      cfg,
      { staticOnly: true, llmConsented: true },
      { agentCliAvailable: available },
    );
    expect(c).toBeInstanceOf(NoopAdapter);
  });
});
