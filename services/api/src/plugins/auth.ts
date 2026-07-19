/**
 * Auth plugin: verifies the bearer token, confirms the membership is still
 * active, and attaches `request.principal`. Routes opt in with
 * `{ preHandler: app.authenticate }`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config/env.js";
import { verifyAccessToken, verifyClientToken } from "../lib/jwt.js";
import { unauthorized } from "../lib/errors.js";
import type { Principal } from "../lib/context.js";

export interface ClientPrincipal {
  clientId: string;
  organizationId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
    clientPrincipal?: ClientPrincipal;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateClient: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function registerAuth(app: FastifyInstance, deps: { prisma: PrismaClient; env: Env }): void {
  app.decorate("authenticate", async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw unauthorized("Missing bearer token");
    }
    const token = header.slice("Bearer ".length);
    let claims;
    try {
      claims = await verifyAccessToken(token, deps.env.JWT_SECRET);
    } catch {
      throw unauthorized("Invalid or expired token");
    }
    const membership = await deps.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: claims.org, userId: claims.sub } },
    });
    if (!membership || membership.status !== "active") {
      throw unauthorized("Membership is not active");
    }
    request.principal = {
      userId: claims.sub,
      organizationId: claims.org,
      role: membership.role,
    };
  });

  app.decorate("authenticateClient", async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
    let claims;
    try {
      claims = await verifyClientToken(header.slice("Bearer ".length), deps.env.JWT_SECRET);
    } catch {
      throw unauthorized("Invalid or expired portal token");
    }
    const client = await deps.prisma.client.findUnique({ where: { id: claims.sub } });
    if (!client || client.organizationId !== claims.org || client.archivedAt) {
      throw unauthorized("Portal access revoked");
    }
    request.clientPrincipal = { clientId: client.id, organizationId: client.organizationId };
  });
}

/** Read the principal or throw — use inside handlers after `authenticate`. */
export function principalOf(request: FastifyRequest): Principal {
  if (!request.principal) throw unauthorized();
  return request.principal;
}

/** Read the client principal or throw — use after `authenticateClient`. */
export function clientPrincipalOf(request: FastifyRequest): ClientPrincipal {
  if (!request.clientPrincipal) throw unauthorized();
  return request.clientPrincipal;
}
