/**
 * JWT signing/verification (HS256 for dev; swap to RS256 keys in production).
 * Uses `jose` (pure JS) so there are no native build dependencies.
 */

import { jwtVerify, SignJWT } from "jose";

export interface AccessClaims {
  sub: string; // user id
  org: string; // organization id
  role: string; // membership role
}

function keyBytes(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: AccessClaims,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({ org: claims.org, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(keyBytes(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, keyBytes(secret));
  if (payload.kind === "client") throw new Error("Client token used on a coach endpoint");
  if (typeof payload.sub !== "string" || typeof payload.org !== "string" || typeof payload.role !== "string") {
    throw new Error("Malformed token claims");
  }
  return { sub: payload.sub, org: payload.org, role: payload.role };
}

export interface ClientClaims {
  sub: string; // client id
  org: string; // organization id
}

/** Client-portal access token (kind=client) — never valid on coach endpoints. */
export async function signClientToken(
  claims: ClientClaims,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({ org: claims.org, kind: "client" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(keyBytes(secret));
}

export async function verifyClientToken(token: string, secret: string): Promise<ClientClaims> {
  const { payload } = await jwtVerify(token, keyBytes(secret));
  if (payload.kind !== "client" || typeof payload.sub !== "string" || typeof payload.org !== "string") {
    throw new Error("Malformed client token");
  }
  return { sub: payload.sub, org: payload.org };
}
