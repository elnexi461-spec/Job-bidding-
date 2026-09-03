import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { EncryptedToken } from "./types";

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = 1;

export class TokenVault {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) {
      throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes");
    }
    this.key = Buffer.from(key);
  }

  encrypt(value: string): EncryptedToken {
    if (!value) {
      throw new Error("Cannot encrypt an empty token");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString("base64url"),
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      keyVersion: KEY_VERSION,
    };
  }

  decrypt(token: EncryptedToken): string {
    if (token.keyVersion !== KEY_VERSION) {
      throw new Error(`Unsupported token key version: ${token.keyVersion}`);
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(token.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(token.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(token.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}

export function tokenVaultFromEnvironment(): TokenVault {
  const raw = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!raw && !sessionSecret) {
    throw new Error(
      "EMAIL_TOKEN_ENCRYPTION_KEY or SESSION_SECRET is required to use email OAuth connections",
    );
  }
  const key = raw
    ? /^[0-9a-f]{64}$/i.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64")
    : createHash("sha256")
        .update(`job-bidding-email-engine:${sessionSecret}`)
        .digest();
  return new TokenVault(key);
}