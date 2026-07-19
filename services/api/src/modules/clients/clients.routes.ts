import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { principalOf } from "../../plugins/auth.js";
import { requireClientInOrg } from "../../lib/context.js";
import { badRequest, paymentRequired } from "../../lib/errors.js";
import { evaluateClientQuota } from "../../domain/plans/plans.js";
import { activeClientCount, loadOrgPlan } from "../billing/plan-context.js";

const CreateClientBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  country: z.string().optional(),
  pronouns: z.string().optional(),
  tags: z.array(z.string()).optional(),
  goalSummary: z.string().optional(),
  privateNotes: z.string().optional(),
});

const UpdateClientBody = CreateClientBody.partial();

export function clientRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }): void {
  const { prisma } = deps;

  app.get("/v1/clients", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const query = z.object({ includeArchived: z.coerce.boolean().optional() }).parse(request.query);
    const clients = await prisma.client.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(query.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: "desc" },
    });
    return { clients };
  });

  app.post("/v1/clients", { preHandler: app.authenticate }, async (request, reply) => {
    const principal = principalOf(request);
    const parsed = CreateClientBody.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input", "validation_error");

    // Enforce the configurable client cap (Spec §13).
    const plan = await loadOrgPlan(prisma, principal.organizationId);
    const used = await activeClientCount(prisma, principal.organizationId);
    const quota = evaluateClientQuota(plan, used);
    if (!quota.allowed) {
      throw paymentRequired(`Client limit reached for plan ${plan.publicName}`, "client_limit_reached");
    }

    const client = await prisma.client.create({
      data: {
        organizationId: principal.organizationId,
        primaryCoachId: principal.userId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        locale: parsed.data.locale,
        timezone: parsed.data.timezone,
        country: parsed.data.country,
        pronouns: parsed.data.pronouns,
        tags: parsed.data.tags ?? [],
        goalSummary: parsed.data.goalSummary,
        privateNotes: parsed.data.privateNotes,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: principal.userId, organizationId: principal.organizationId, action: "client.create", resourceType: "client", resourceId: client.id },
    });
    return reply.code(201).send({ client });
  });

  app.get("/v1/clients/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const client = await requireClientInOrg(prisma, principal, id);
    return { client };
  });

  app.patch("/v1/clients/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await requireClientInOrg(prisma, principal, id);
    const parsed = UpdateClientBody.safeParse(request.body);
    if (!parsed.success) throw badRequest("Invalid input", "validation_error");
    const client = await prisma.client.update({ where: { id }, data: parsed.data });
    return { client };
  });

  // Archive rather than hard-delete (Spec §28.7 recovery window).
  app.delete("/v1/clients/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await requireClientInOrg(prisma, principal, id);
    const client = await prisma.client.update({ where: { id }, data: { archivedAt: new Date() } });
    await prisma.auditLog.create({
      data: { actorId: principal.userId, organizationId: principal.organizationId, action: "client.archive", resourceType: "client", resourceId: id },
    });
    return { client };
  });
}
