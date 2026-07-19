import { createHash, randomBytes } from "node:crypto";

/** A URL-safe opaque token (for magic links). Only its hash is stored. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
