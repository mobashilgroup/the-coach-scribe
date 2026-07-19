import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccessToken } from "../../lib/jwt.js";
import { uniqueSlug } from "../../lib/slug.js";
import { conflict, unauthorized } from "../../lib/errors.js";

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  country?: string;
  timezone?: string;
  locale?: string;
  organizationName?: string;
}

export interface AuthResult {
  accessToken: string;
  user: { id: string; email: string; firstName: string };
  organization: { id: string; slug: string };
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    // Neutral message — do not disclose whether an account exists (Spec §10.2).
    if (existing) throw conflict("Could not create account", "registration_failed");

    const passwordHash = await hashPassword(input.password);
    const trialPlan = await this.prisma.plan.findFirst({
      where: { name: "free_trial", active: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          country: input.country,
          timezone: input.timezone ?? "UTC",
          locale: input.locale ?? "en",
        },
      });

      const org = await tx.organization.create({
        data: {
          name: input.organizationName ?? `${input.firstName}'s practice`,
          slug: uniqueSlug(input.organizationName ?? input.firstName),
          ownerUserId: user.id,
          planId: trialPlan?.id,
        },
      });

      await tx.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "owner", status: "active" },
      });

      await tx.coachProfile.create({
        data: { userId: user.id, displayName: input.firstName, specialties: [], languages: [input.locale ?? "en"] },
      });

      if (trialPlan) {
        await tx.subscription.create({
          data: { organizationId: org.id, planId: trialPlan.id, provider: "none", status: "trialing" },
        });
      }

      await tx.auditLog.create({
        data: { actorId: user.id, organizationId: org.id, action: "auth.register", resourceType: "user", resourceId: user.id },
      });

      return { user, org };
    });

    const accessToken = await signAccessToken(
      { sub: result.user.id, org: result.org.id, role: "owner" },
      this.env.JWT_SECRET,
      this.env.JWT_ACCESS_TTL,
    );

    return {
      accessToken,
      user: { id: result.user.id, email: result.user.email, firstName: result.user.firstName },
      organization: { id: result.org.id, slug: result.org.slug },
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    const invalid = unauthorized("Invalid email or password", "invalid_credentials");
    if (!user || !user.passwordHash) throw invalid;
    if (user.status === "suspended") throw unauthorized("Account suspended", "account_suspended");
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw invalid;

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) throw unauthorized("No active organization", "no_membership");

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: membership.organizationId } });
    const accessToken = await signAccessToken(
      { sub: user.id, org: org.id, role: membership.role },
      this.env.JWT_SECRET,
      this.env.JWT_ACCESS_TTL,
    );

    return {
      accessToken,
      user: { id: user.id, email: user.email, firstName: user.firstName },
      organization: { id: org.id, slug: org.slug },
    };
  }
}
