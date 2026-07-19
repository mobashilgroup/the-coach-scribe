/**
 * Authenticated request context and tenant-isolation helpers (Spec §16.2).
 *
 * Every authenticated request resolves to a Principal (user + organization +
 * role). Data access helpers here are the single chokepoint that guarantees a
 * coach can only reach clients/sessions inside their own organization — a
 * `clientId` from the browser is never trusted without this check.
 */

import type { PrismaClient } from "@prisma/client";
import { forbidden, notFound } from "./errors.js";

export interface Principal {
  userId: string;
  organizationId: string;
  role: string;
}

/** Load a client only if it belongs to the principal's organization. */
export async function requireClientInOrg(
  prisma: PrismaClient,
  principal: Principal,
  clientId: string,
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw notFound("Client not found");
  if (client.organizationId !== principal.organizationId) {
    // Do not reveal existence across tenants.
    throw notFound("Client not found");
  }
  return client;
}

/** Load a session only if it belongs to the principal's organization. */
export async function requireSessionInOrg(
  prisma: PrismaClient,
  principal: Principal,
  sessionId: string,
) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound("Session not found");
  if (session.organizationId !== principal.organizationId) {
    throw notFound("Session not found");
  }
  return session;
}

/** Coaches may only act on their own sessions unless they are org admins. */
export function assertCanMutateSession(
  principal: Principal,
  session: { coachId: string },
): void {
  const privileged = principal.role === "owner" || principal.role === "admin";
  if (!privileged && session.coachId !== principal.userId) {
    throw forbidden("You do not have access to this session");
  }
}
