# Security Policy — Lyse

## Reporting vulnerabilities

If you discover a security vulnerability in Lyse, please report it **privately** before disclosing publicly:

- **GitHub Security Advisories:** https://github.com/lyse-labs/lyse/security/advisories/new (preferred)
- **Email:** contact@getlyse.com. For PGP-encrypted reports, please request the key by email.

We aim to respond within **5 business days**. Critical issues (RCE, data exfiltration, auth bypass) get a same-day acknowledgment.

## Supported versions

The **latest minor** receives security fixes. Older minors get fixes only for critical (CVSS >= 9.0) issues.

## Security model

Lyse is designed to **minimise the attack surface** by handling everything client-side:

| Component | Trust boundary | Notes |
|---|---|---|
| `lyse` (npm CLI) | User's machine / CI runner | Runs entirely locally. No source code leaves the runner. No outbound network calls when `LYSE_TELEMETRY` is unset (default). Verified by [no-leak tests](./packages/core/tests/security/no-leak.test.ts). |
| `api.getlyse.com` (Cloudflare Worker) | Our infrastructure | Receives ONLY the JSON event payload (see [PRIVACY.md](./PRIVACY.md)). IP/User-Agent dropped at the edge before any storage operation. Rate-limited per anonymous bucket. |
| `lyse handoff` (agent launch) | The repository you run it in | Launches your coding agent (Claude Code / Cursor / Codex) with its permission prompts **bypassed** so it can apply fixes unattended. The payload is passed as a single argv (no shell interpolation, injection-safe). Run only on repositories you trust. |

## Cryptographic posture

| Concern | Mechanism |
|---|---|
| npm release integrity | `npm publish --provenance` (Sigstore attestation) |
| Release tag integrity | GPG-signed git tags |
| License JWT | Ed25519 (EdDSA), public key embedded in the package, private key offline. Rotated on major-version bumps. |
| `repo_bucket` anonymisation | SHA-256 with a server-side salt rotated daily |

## Out of scope

- Vulnerabilities in dependencies upstream from Lyse (report to those projects). We monitor advisories and ship `dependabot` patches.
- Issues that require the user to have already compromised their own machine.
- Theoretical timing attacks against the rule engine (the engine produces public output by design).
- Anything related to the user's own design system content — Lyse does not introspect runtime data.

## Hall of fame

Credits for responsibly disclosed issues will be listed here.
