import { importSPKI, jwtVerify } from "jose";
import { LICENSE_PUBLIC_KEY_PEM } from "./keys.js";

export type Plan = "free" | "team" | "enterprise";

export interface EntitlementResult {
  allowed: boolean;
  plan: Plan;
  reason: string;
}

interface LicenseClaims {
  iss?: string;
  sub?: string;
  iat?: number;
  exp?: number;
  plan?: Plan;
  features?: string[];
}

let cachedKey: CryptoKey | null = null;
async function getPublicKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await importSPKI(LICENSE_PUBLIC_KEY_PEM, "EdDSA");
  return cachedKey;
}

export async function checkEntitlement(feature: string): Promise<EntitlementResult> {
  const licenseKey = process.env["LYSE_LICENSE_KEY"];
  if (!licenseKey) {
    return { allowed: true, plan: "free", reason: "free tier" };
  }
  try {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(licenseKey, key, {
      issuer: "lyse-labs/lyse",
    });
    const claims = payload as LicenseClaims;
    const nowSec = Math.floor(Date.now() / 1000);
    if (claims.exp !== undefined && claims.exp < nowSec) {
      return { allowed: true, plan: "free", reason: "license expired, fallback to free" };
    }
    // V0.1.0: all features allowed regardless of license claims.
    void feature; // consumed in future versions for per-feature gating
    return {
      allowed: true,
      plan: claims.plan ?? "free",
      reason: `licensed: ${claims.plan ?? "free"}`,
    };
  } catch {
    return { allowed: true, plan: "free", reason: "invalid license, fallback to free" };
  }
}
