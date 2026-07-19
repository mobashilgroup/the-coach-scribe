/**
 * Minimal platform admin console (Spec §26). Gated by an email allowlist
 * (ADMIN_EMAILS) on top of normal auth. Exposes an overview, the plan manager,
 * a job monitor, feature flags, and usage — without ever showing session content.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { principalOf } from "../../plugins/auth.js";
import { forbidden, notFound } from "../../lib/errors.js";

function adminEmails(env: Env): Set<string> {
  return new Set(env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function adminRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; env: Env }): void {
  const { prisma, env } = deps;
  const allow = adminEmails(env);

  async function requireAdmin(request: FastifyRequest): Promise<void> {
    const principal = principalOf(request);
    const user = await prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user || !allow.has(user.email.toLowerCase())) throw forbidden("Admin access required", "not_admin");
  }
  const guard = { preHandler: [app.authenticate, requireAdmin] };

  app.get("/v1/admin/overview", guard, async () => {
    const [users, orgs, sessions, failed, processing, subscriptions] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.session.count(),
      prisma.session.count({ where: { status: { in: ["failed_upload", "failed_transcription", "failed_summary"] } } }),
      prisma.session.count({ where: { status: { in: ["transcribing", "summarizing", "uploading"] } } }),
      prisma.subscription.groupBy({ by: ["status"], _count: true }),
    ]);
    return { users, organizations: orgs, sessions, failedJobs: failed, processingJobs: processing, subscriptions };
  });

  // --- Plan manager (Spec §26.2) -----------------------------------------
  app.get("/v1/admin/plans", guard, async () => ({ plans: await prisma.plan.findMany({ orderBy: { price: "asc" } }) }));

  const PlanBody = z.object({
    name: z.string().min(1),
    publicName: z.string().min(1),
    price: z.number().int().nonnegative().default(0),
    currency: z.string().default("USD"),
    billingInterval: z.string().default("month"),
    limitsJson: z.record(z.unknown()).default({}),
    featuresJson: z.record(z.unknown()).default({}),
    active: z.boolean().default(true),
  });

  app.post("/v1/admin/plans", guard, async (request, reply) => {
    const body = PlanBody.parse(request.body);
    const plan = await prisma.plan.create({
      data: { ...body, limitsJson: body.limitsJson as Prisma.InputJsonValue, featuresJson: body.featuresJson as Prisma.InputJsonValue },
    });
    return reply.code(201).send({ plan });
  });

  app.patch("/v1/admin/plans/:id", guard, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = PlanBody.partial().parse(request.body);
    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) throw notFound("Plan not found");
    const data: Prisma.PlanUpdateInput = { ...body } as Prisma.PlanUpdateInput;
    if (body.limitsJson !== undefined) data.limitsJson = body.limitsJson as Prisma.InputJsonValue;
    if (body.featuresJson !== undefined) data.featuresJson = body.featuresJson as Prisma.InputJsonValue;
    const plan = await prisma.plan.update({ where: { id }, data });
    return { plan };
  });

  // --- Job monitor (Spec §26.3) — no transcript content ------------------
  app.get("/v1/admin/jobs", guard, async (request) => {
    const { status } = z.object({ status: z.string().optional() }).parse(request.query);
    const jobs = await prisma.session.findMany({
      where: status ? { status: status as never } : { status: { in: ["transcribing", "summarizing", "uploading", "failed_transcription", "failed_summary", "failed_upload"] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, organizationId: true, status: true, inputMethod: true, updatedAt: true },
    });
    return { jobs };
  });

  // --- Feature flags (Spec §26.5) ----------------------------------------
  app.get("/v1/admin/flags", guard, async () => {
    const row = await prisma.setting.findUnique({ where: { key: "feature_flags" } });
    return { flags: row?.valueJson ?? {} };
  });

  app.put("/v1/admin/flags", guard, async (request) => {
    const flags = z.record(z.boolean()).parse(request.body);
    const row = await prisma.setting.upsert({
      where: { key: "feature_flags" },
      update: { valueJson: flags },
      create: { key: "feature_flags", valueJson: flags },
    });
    return { flags: row.valueJson };
  });

  // --- Usage & cost (Spec §26.1) -----------------------------------------
  app.get("/v1/admin/usage", guard, async () => {
    const usage = await prisma.usageLedger.groupBy({ by: ["metric", "period"], _sum: { quantity: true } });
    return { usage };
  });
}
