import { createHmac } from "node:crypto";

export function normalizeRemoteUrl(url: string): string {
  return url.toLowerCase().replace(/\.git$/, "").replace(/\/+$/, "");
}

export function computeRepoBucket(remoteUrl: string, salt: string): string {
  const normalized = normalizeRemoteUrl(remoteUrl);
  return createHmac("sha256", salt).update(normalized).digest("hex").slice(0, 16);
}
