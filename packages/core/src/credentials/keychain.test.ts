import { describe, it, expect, vi } from "vitest";
import { KeychainCredentialStore, type KeytarLike } from "./keychain.js";

describe("KeychainCredentialStore", () => {
  it("set + get delegates to keytar", async () => {
    const fakeKeytar: KeytarLike = {
      getPassword: vi.fn().mockResolvedValueOnce("sk-ant"),
      setPassword: vi.fn().mockResolvedValue(undefined),
      deletePassword: vi.fn().mockResolvedValue(true),
      findCredentials: vi.fn().mockResolvedValue([]),
    };
    const s = new KeychainCredentialStore("com.lyse-labs.lyse", fakeKeytar);
    await s.set("anthropic_api_key", "sk-ant");
    expect(fakeKeytar.setPassword).toHaveBeenCalledWith(
      "com.lyse-labs.lyse",
      "anthropic_api_key",
      "sk-ant",
    );
    const v = await s.get("anthropic_api_key");
    expect(v).toBe("sk-ant");
  });

  it("listKeys returns account names from findCredentials", async () => {
    const fakeKeytar: KeytarLike = {
      getPassword: vi.fn(),
      setPassword: vi.fn(),
      deletePassword: vi.fn(),
      findCredentials: vi.fn().mockResolvedValue([
        { account: "anthropic_api_key", password: "..." },
        { account: "openai_api_key", password: "..." },
      ]),
    };
    const s = new KeychainCredentialStore("com.lyse-labs.lyse", fakeKeytar);
    const keys = await s.listKeys();
    expect(keys.sort()).toEqual(["anthropic_api_key", "openai_api_key"]);
  });
});
