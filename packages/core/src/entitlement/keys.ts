/**
 * Embedded ed25519 public key for Lyse license JWT verification.
 * The private key lives off-disk (1Password / GPG-encrypted file).
 *
 * Rotated on major version bumps. To rotate:
 *   1. Generate a new ed25519 keypair offline.
 *   2. Update this constant with the new SPKI PEM.
 *   3. Re-issue all customer licenses signed with the new private key.
 */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAjzD8qvI8GqaVYefSRMfqGalyVHR95wCKwXg8dTrr7s4=
-----END PUBLIC KEY-----
`;
