import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { principalOf } from "../../plugins/auth.js";
import { notFound } from "../../lib/errors.js";

export function taskRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }): void {
  const { prisma } = deps;

  app.get("/v1/tasks", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const query = z.object({ clientId: z.string().optional(), status: z.string().optional() }).parse(request.query);
    const tasks = await prisma.actionItem.findMany({
      where: {
        client: { organizationId: principal.organizationId },
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return { tasks };
  });

  app.patch("/v1/tasks/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        status: z.enum(["pending", "in_progress", "completed", "skipped", "cancelled"]).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        dueAt: z.coerce.date().optional(),
        priority: z.string().optional(),
      })
      .parse(request.body);

    const existing = await prisma.actionItem.findUnique({ where: { id }, include: { client: true } });
    if (!existing || existing.client.organizationId !== principal.organizationId) throw notFound("Task not found");

    const task = await prisma.actionItem.update({ where: { id }, data: body });
    return { task };
  });

  app.get("/v1/goals", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const query = z.object({ clientId: z.string().optional() }).parse(request.query);
    const goals = await prisma.goal.findMany({
      where: {
        client: { organizationId: principal.organizationId },
        ...(query.clientId ? { clientId: query.clientId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return { goals };
  });

  app.patch("/v1/goals/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        status: z.enum(["active", "achieved", "paused", "dropped"]).optional(),
        progress: z.number().int().min(0).max(100).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        targetDate: z.coerce.date().optional(),
      })
      .parse(request.body);

    const existing = await prisma.goal.findUnique({ where: { id }, include: { client: true } });
    if (!existing || existing.client.organizationId !== principal.organizationId) throw notFound("Goal not found");

    const goal = await prisma.goal.update({ where: { id }, data: body });
    return { goal };
  });
}
