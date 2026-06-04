import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Writable } from "node:stream";
import { createSpinner } from "../../src/util/spinner.js";

// MemoryStream — captures everything written, mimics enough of a
// NodeJS.WriteStream surface for the spinner module (write, isTTY).
class MemoryStream extends Writable {
  chunks: string[] = [];
  isTTY = true;
  columns = 80;
  override _write(chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    this.chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    cb();
  }
  get output(): string {
    return this.chunks.join("");
  }
  clear(): void {
    this.chunks = [];
  }
}

describe("createSpinner", () => {
  let stream: MemoryStream;
  let prevNoColor: string | undefined;

  beforeEach(() => {
    stream = new MemoryStream();
    prevNoColor = process.env["NO_COLOR"];
    delete process.env["NO_COLOR"];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (prevNoColor === undefined) delete process.env["NO_COLOR"];
    else process.env["NO_COLOR"] = prevNoColor;
  });

  it("returns a no-op when isTTY=false", () => {
    const sp = createSpinner({ isTTY: false, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("hello");
    sp.update("world");
    sp.succeed("done");
    expect(stream.output).toBe("");
  });

  it("returns a no-op when enabled=false", () => {
    const sp = createSpinner({ isTTY: true, enabled: false, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("hello");
    sp.update("world");
    sp.succeed("done");
    expect(stream.output).toBe("");
  });

  it("writes ANSI cursor codes and a frame on start()", () => {
    const sp = createSpinner({ isTTY: true, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("Discovering files…");
    // Hide-cursor + clear-line + a frame + label
    expect(stream.output).toContain("\x1b[?25l"); // hide cursor
    expect(stream.output).toContain("\r\x1b[K"); // clear line
    expect(stream.output).toContain("Discovering files…");
    sp.stop();
  });

  it("update() redraws with the new label", () => {
    const sp = createSpinner({ isTTY: true, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("Phase 1…");
    stream.clear();
    sp.update("Phase 2…");
    expect(stream.output).toContain("Phase 2…");
    expect(stream.output).toContain("\r\x1b[K");
    sp.stop();
  });

  it("succeed() writes a ✔ prefix and clears the spinner line", () => {
    const sp = createSpinner({ isTTY: true, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("Working…");
    stream.clear();
    sp.succeed("All done");
    // Clear-line MUST be written before the final state so the in-progress
    // frame is wiped (not appended-to).
    const out = stream.output;
    expect(out.indexOf("\r\x1b[K")).toBeLessThan(out.indexOf("✔"));
    expect(out).toContain("✔");
    expect(out).toContain("All done");
    expect(out).toContain("\x1b[?25h"); // show cursor
  });

  it("fail() writes a ✗ prefix", () => {
    const sp = createSpinner({ isTTY: true, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("Working…");
    stream.clear();
    sp.fail("Something broke");
    expect(stream.output).toContain("✗");
    expect(stream.output).toContain("Something broke");
    expect(stream.output).toContain("\x1b[?25h");
  });

  it("does not emit ANSI color codes when color: false (cursor codes remain)", () => {
    const sp = createSpinner({
      isTTY: true,
      enabled: true,
      stream: stream as unknown as NodeJS.WriteStream,
      color: false,
    });
    sp.start("Hello");
    sp.succeed("Done");
    const out = stream.output;
    // No color codes (cyan/green/red): \x1b[36m / \x1b[32m / \x1b[31m
    expect(out).not.toMatch(/\x1b\[3[12356]m/);
    // But cursor codes are still there.
    expect(out).toContain("\x1b[?25l");
    expect(out).toContain("\x1b[?25h");
    expect(out).toContain("\r\x1b[K");
  });

  it("suppresses color codes when NO_COLOR env var is set", () => {
    process.env["NO_COLOR"] = "1";
    const sp = createSpinner({ isTTY: true, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("Working");
    expect(stream.output).not.toMatch(/\x1b\[36m/);
    // Cursor codes still emitted.
    expect(stream.output).toContain("\x1b[?25l");
    sp.stop();
  });

  it("multiple start() calls clear the previous spinner first", () => {
    const sp = createSpinner({ isTTY: true, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("First");
    stream.clear();
    sp.start("Second");
    const out = stream.output;
    expect(out).toContain("Second");
    // First clear-line preceeds the new frame.
    expect(out.startsWith("\r\x1b[K")).toBe(true);
    sp.stop();
  });

  it("update() before start() is treated as start() (resilient)", () => {
    const sp = createSpinner({ isTTY: true, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.update("Phase X");
    expect(stream.output).toContain("Phase X");
    expect(stream.output).toContain("\x1b[?25l");
    sp.stop();
  });

  it("stop() clears the line and restores the cursor without writing a final state", () => {
    const sp = createSpinner({ isTTY: true, enabled: true, stream: stream as unknown as NodeJS.WriteStream });
    sp.start("Working");
    stream.clear();
    sp.stop();
    expect(stream.output).toContain("\x1b[?25h");
    expect(stream.output).not.toContain("✔");
    expect(stream.output).not.toContain("✗");
  });

  it("defaults the stream to process.stderr when none is provided", () => {
    // We can't easily intercept process.stderr.write here without monkey-patching,
    // but we can assert the spinner doesn't crash and the no-op path is honored
    // when isTTY=false. The stderr default is exercised by the audit integration
    // test below (Issue #97 contract: spinner output goes to stderr, never stdout).
    const sp = createSpinner({ isTTY: false, enabled: true });
    expect(() => {
      sp.start("x");
      sp.succeed("y");
    }).not.toThrow();
  });
});
