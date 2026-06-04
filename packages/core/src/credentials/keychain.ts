import type { CredentialStore } from "./store.js";

export interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

export class KeychainCredentialStore implements CredentialStore {
  constructor(private service: string, private keytar: KeytarLike) {}

  static async create(service: string): Promise<KeychainCredentialStore | null> {
    try {
      const keytar = (await import("keytar")) as unknown as KeytarLike;
      // Smoke test: try a no-op call to verify the native module loaded properly.
      await keytar.findCredentials(service);
      return new KeychainCredentialStore(service, keytar);
    } catch {
      // keytar not installed, or native module failed to load (common on Linux without libsecret).
      // Caller falls back to PlainFileCredentialStore.
      return null;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.keytar.getPassword(this.service, key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.keytar.setPassword(this.service, key, value);
  }

  async delete(key: string): Promise<void> {
    await this.keytar.deletePassword(this.service, key);
  }

  async listKeys(): Promise<string[]> {
    const creds = await this.keytar.findCredentials(this.service);
    return creds.map((c) => c.account);
  }
}
