/**
 * Client-portal access (Spec §11.1). Coach issues a single-use, expiring magic
 * link; the client exchanges it for a client-scoped access token. Only the
 * token hash is stored and the link carries no sensitive data.
 */

import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { generateToken, hashToken } from "../../lib/tokens.js";
import { signClientToken } from "../../lib/jwt.js";
import { badRequest, unauthorized } from "../../lib/errors.js";

const INVITE_TTL_HOURS = 72;

export class PortalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  /** Create a magic-link token for a client. Returns the raw token (shown once). */
  async invite(clientId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
    await this.prisma.$transaction([
      this.prisma.portalInvite.create({ data: { clientId, tokenHash: hashToken(token), expiresAt } }),
      this.prisma.client.update({ where: { id: clientId }, data: { portalStatus: "invited" } }),
    ]);
    return { token, expiresAt };
  }

  /** Exchange a magic-link token for a client access token. */
  async exchange(token: string): Promise<{ accessToken: string; client: { id: string; firstName: string } }> {
    if (!token) throw badRequest("Missing token", "missing_token");
    const invite = await this.prisma.portalInvite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) {
      throw unauthorized("This link is invalid or has expired", "invalid_link");
    }
    const client = await this.prisma.client.findUnique({ where: { id: invite.clientId } });
    if (!client || client.archivedAt) throw unauthorized("Portal access revoked", "revoked");

    await this.prisma.$transaction([
      this.prisma.portalInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
      this.prisma.client.update({ where: { id: client.id }, data: { portalStatus: "active" } }),
    ]);

    const accessToken = await signClientToken(
      { sub: client.id, org: client.organizationId },
      this.env.JWT_SECRET,
      this.env.JWT_REFRESH_TTL, // portal sessions are longer-lived
    );
    return { accessToken, client: { id: client.id, firstName: client.firstName } };
  }
}
