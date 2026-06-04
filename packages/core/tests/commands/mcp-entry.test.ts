import { describe, it, expect } from "vitest";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLyseMcpEntry } from "../../src/commands/mcp-entry.js";

describe("resolveLyseMcpEntry", () => {
  it("returns npx entry when argv1 is under a node_modules directory", () => {
    const entry = resolveLyseMcpEntry({
      argv1: "/usr/local/lib/node_modules/lyse/dist/cli.js",
    });
    expect(entry).toEqual({ command: "npx", args: ["-y", "@lyse-labs/lyse", "mcp"] });
  });

  it("returns absolute-path node entry when argv1 is in a dev tree (no node_modules ancestor)", () => {
    const entry = resolveLyseMcpEntry({
      argv1: "/Users/dev/lyse/packages/core/dist/cli.js",
    });
    expect(entry).toEqual({
      command: "node",
      args: ["/Users/dev/lyse/packages/core/dist/cli.js", "mcp"],
    });
  });

  it("realpath-resolves a symlinked argv1 to its real path in dev mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-mcp-entry-"));
    try {
      const realPathRaw = join(dir, "real-cli.js");
      const linkPath = join(dir, "link-cli.js");
      writeFileSync(realPathRaw, "// fake cli\n");
      symlinkSync(realPathRaw, linkPath);
      const expectedReal = realpathSync(realPathRaw);

      const entry = resolveLyseMcpEntry({ argv1: linkPath });
      expect(entry.command).toBe("node");
      expect(entry.args).toEqual([expectedReal, "mcp"]);
      expect(entry.args[0]).not.toBe(linkPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects npm mode for the npx -y cache path shape", () => {
    const entry = resolveLyseMcpEntry({
      argv1: "/Users/dev/.npm/_npx/abc123/node_modules/lyse/dist/cli.js",
    });
    expect(entry).toEqual({ command: "npx", args: ["-y", "@lyse-labs/lyse", "mcp"] });
  });

  it("detects npm mode for the pnpm content-addressed store path shape", () => {
    const entry = resolveLyseMcpEntry({
      argv1: "/Users/dev/.local/share/pnpm/global/5/node_modules/.pnpm/lyse@0.1.0/node_modules/lyse/dist/cli.js",
    });
    expect(entry).toEqual({ command: "npx", args: ["-y", "@lyse-labs/lyse", "mcp"] });
  });

  it("forces dev mode when dev=true is passed, even if argv1 looks npm-installed", () => {
    const entry = resolveLyseMcpEntry({
      argv1: "/usr/local/lib/node_modules/lyse/dist/cli.js",
      dev: true,
    });
    expect(entry.command).toBe("node");
    expect(entry.args).toEqual([
      "/usr/local/lib/node_modules/lyse/dist/cli.js",
      "mcp",
    ]);
  });

  it("argv1 omitted reads from process.argv[1] (documented default)", () => {
    const entry = resolveLyseMcpEntry({});
    expect(entry.command).toBe("npx");
  });

  it("argv1 empty string forces dev mode (no-argv1-available semantics)", () => {
    const entry = resolveLyseMcpEntry({ argv1: "" });
    expect(entry).toEqual({ command: "node", args: ["", "mcp"] });
  });
});
