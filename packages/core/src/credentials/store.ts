import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { defaultCredentialsPath } from "./paths.js";
import { KeychainCredentialStore } from "./keychain.js";

export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
}

export class PlainFileCredentialStore implements CredentialStore {
  constructor(private path: string) {}

  async get(key: string): Promise<string | null> {
    const map = await this.read();
    return map[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const map = await this.read();
    map[key] = value;
    await this.write(map);
  }

  async delete(key: string): Promise<void> {
    const map = await this.read();
    delete map[key];
    await this.write(map);
  }

  async listKeys(): Promise<string[]> {
    const map = await this.read();
    return Object.keys(map);
  }

  private async read(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(this.path, "utf8");
      return JSON.parse(raw) as Record<string, string>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  private async write(map: Record<string, string>): Promise<void> {
    if (Object.keys(map).length === 0) {
      // Remove the file entirely when no keys remain — disconnect should leave no trace.
      try {
        await fs.unlink(this.path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      return;
    }
    await fs.mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.path, JSON.stringify(map, null, 2), { mode: 0o600 });
    await fs.chmod(this.path, 0o600);
  }
}

export async function createCredentialStore(): Promise<CredentialStore> {
  const keychain = await KeychainCredentialStore.create("com.lyse-labs.lyse");
  return keychain ?? new PlainFileCredentialStore(defaultCredentialsPath());
}
