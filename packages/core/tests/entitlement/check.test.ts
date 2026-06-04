import { describe, it, expect, afterEach } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import { checkEntitlement } from "../../src/entitlement/check.js";

describe("checkEntitlement", () => {
  const originalEnv = process.env["LYSE_LICENSE_KEY"];

  afterEach(() => {
    if (originalEnv === undefined) delete process.env["LYSE_LICENSE_KEY"];
    else process.env["LYSE_LICENSE_KEY"] = originalEnv;
  });

  it("returns free tier when no license key set", async () => {
    delete process.env["LYSE_LICENSE_KEY"];
    const r = await checkEntitlement("audit");
    expect(r.allowed).toBe(true);
    expect(r.plan).toBe("free");
    expect(r.reason).toBe("free tier");
  });

  it("falls back to free when license is malformed", async () => {
    process.env["LYSE_LICENSE_KEY"] = "not-a-jwt";
    const r = await checkEntitlement("audit");
    expect(r.allowed).toBe(true);
    expect(r.plan).toBe("free");
    expect(r.reason).toBe("invalid license, fallback to free");
  });

  it("falls back to free when license is signed by an unknown key", async () => {
    // Generate a different keypair and sign a JWT with it. Embedded public key won't verify.
    const { privateKey } = await generateKeyPair("EdDSA");
    const jwt = await new SignJWT({ plan: "team" })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuer("lyse-labs/lyse")
      .setIssuedAt()
      .setExpirationTime("1y")
      .sign(privateKey);
    process.env["LYSE_LICENSE_KEY"] = jwt;
    const r = await checkEntitlement("audit");
    expect(r.allowed).toBe(true);
    expect(r.plan).toBe("free");
    expect(r.reason).toContain("invalid license");
  });

  it("V0.1.0: all features allowed regardless of plan", async () => {
    delete process.env["LYSE_LICENSE_KEY"];
    for (const feature of ["audit", "agents-md", "mcp_server", "audit_log_export"]) {
      const r = await checkEntitlement(feature);
      expect(r.allowed).toBe(true);
    }
  });
});
