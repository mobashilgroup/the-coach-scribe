/**
 * Auth plugin: verifies the bearer token, confirms the membership is still
 * active, and attaches `request.principal`. Routes opt in with
 * `{ preHandler: app.authenticate }`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config/env.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { unauthorized } from "../lib/errors.js";
import type { Principal } from "../lib/context.js";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
}

/** Read the principal or throw — use inside handlers after `authenticate`. */
export function principalOf(request: FastifyRequest): Principal {
  if (!request.principal) throw unauthorized();
  return request.principal;
}
