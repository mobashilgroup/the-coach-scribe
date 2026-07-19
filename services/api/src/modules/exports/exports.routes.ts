import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { principalOf } from "../../plugins/auth.js";
import { requireSessionInOrg } from "../../lib/context.js";
import { notFound } from "../../lib/errors.js";
import { renderSummaryHtml } from "./html.js";

export function exportRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }): void {
  const { prisma } = deps;

  // GET /v1/sessions/:id/export?format=json|html  (Spec §10.22)
  app.get("/v1/sessions/:id/export", { preHandler: app.authenticate }, async (request, reply) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { format } = z.object({ format: z.enum(["json", "html"]).default("json") }).parse(request.query);

    const session = await requireSessionInOrg(prisma, principal, id);
    const [summary, client, coach, tasks, goals] = await Promise.all([
      prisma.summary.findFirst({ where: { sessionId: id }, orderBy: { version: "desc" } }),
      prisma.client.findUnique({ where: { id: session.clientId } }),
      prisma.user.findUnique({ where: { id: session.coachId } }),
      prisma.actionItem.findMany({ where: { sessionId: id } }),
      prisma.goal.findMany({ where: { sessionId: id } }),
    ]);
    if (!summary) throw notFound("No summary to export");

    const payload = {
      exportedAt: new Date().toISOString(),
      confidentiality: "Confidential — for the named client and coach only.",
      session: { id: session.id, title: session.title, date: session.createdAt, status: session.status, language: session.outputLanguage },
      client: client ? { name: [client.firstName, client.lastName].filter(Boolean).join(" ") } : null,
      coach: coach ? { name: [coach.firstName, coach.lastName].filter(Boolean).join(" ") } : null,
      summary: summary.contentJson,
      tasks: tasks.map((t) => ({ title: t.title, status: t.status, owner: t.ownerType, visibility: t.visibility })),
      goals: goals.map((g) => ({ title: g.title, status: g.status, progress: g.progress })),
    };

    if (format === "html") {
      reply.header("content-type", "text/html; charset=utf-8");
      return reply.send(renderSummaryHtml(payload));
    }
    reply.header("content-type", "application/json");
    reply.header("content-disposition", `attachment; filename="session-${id}.json"`);
    return reply.send(payload);
  });
}
