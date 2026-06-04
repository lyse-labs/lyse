import { homedir } from "node:os";
import { join } from "node:path";

export function defaultCredentialsPath(): string {
  return join(homedir(), ".lyse", "credentials");
}
