import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlainFileCredentialStore } from "./store.js";

describe("PlainFileCredentialStore", () => {
  let dir: string;
  let store: PlainFileCredentialStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lyse-creds-"));
    store = new PlainFileCredentialStore(join(dir, "credentials"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("set + get round-trips a value", async () => {
    await store.set("anthropic_api_key", "sk-ant-secret");
    expect(await store.get("anthropic_api_key")).toBe("sk-ant-secret");
  });

  it("get returns null for unknown key", async () => {
    expect(await store.get("nope")).toBeNull();
  });

  it("delete removes a key", async () => {
    await store.set("k", "v");
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
  });

  it("listKeys returns set keys", async () => {
    await store.set("a", "1");
    await store.set("b", "2");
    const keys = await store.listKeys();
    expect(keys.sort()).toEqual(["a", "b"]);
  });

  it("file is created with chmod 600", async () => {
    await store.set("x", "y");
    const mode = statSync(join(dir, "credentials")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("removes the file entirely when all keys are deleted", async () => {
    await store.set("k1", "v1");
    await store.set("k2", "v2");
    expect(existsSync(join(dir, "credentials"))).toBe(true);
    await store.delete("k1");
    await store.delete("k2");
    expect(existsSync(join(dir, "credentials"))).toBe(false);
  });
});
