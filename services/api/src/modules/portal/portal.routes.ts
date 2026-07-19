import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { clientPrincipalOf, principalOf } from "../../plugins/auth.js";
import { requireClientInOrg } from "../../lib/context.js";
import { PortalService } from "./portal.service.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { badRequest, notFound } from "../../lib/errors.js";

/** Reduce a shared session's summary to only the sections the coach selected. */
function buildSharedSummary(session: { sharedInclude: unknown }, content: Record<string, unknown>) {
  const inc = (session.sharedInclude ?? {}) as Record<string, boolean>;
  const out: Record<string, unknown> = {};
  if (inc.summary !== false) out.summary = content.summary ?? "";
  if (inc.topics !== false) out.topics = content.topics ?? [];
  if (inc.goals !== false) out.goals = content.goals ?? [];
  if (inc.reflectionQuestions) out.reflection_questions = content.reflection_questions ?? [];
  // Transcript, private notes, emotions, and quotes are never exposed to the client.
  return out;
}

export function portalRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; env: Env }): void {
  const { prisma, env } = deps;
  const portal = new PortalService(prisma, env);
  const messaging = new MessagingService(prisma, env);

  // --- Coach issues a portal invitation (magic link) ---------------------
  app.post("/v1/clients/:id/invite", { preHandler: app.authenticate }, async (request, reply) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await requireClientInOrg(prisma, principal, id);
    const { token, expiresAt } = await portal.invite(id);
    const link = `${env.APP_URL}/portal.html#token=${token}`;
    await prisma.auditLog.create({
      data: { organizationId: principal.organizationId, actorId: principal.userId, action: "client.invite", resourceType: "client", resourceId: id },
    });
    // The raw token/link is returned once for the coach to deliver (email/WhatsApp).
    return reply.code(201).send({ link, token, expiresAt });
  });

  // --- Auth ---------------------------------------------------------------
  app.post("/v1/client-portal/exchange", async (request) => {
    const body = z.object({ token: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw badRequest("Missing token", "missing_token");
    return portal.exchange(body.data.token);
  });

  // --- Home & shared content ---------------------------------------------
  app.get("/v1/client-portal/home", { preHandler: app.authenticateClient }, async (request) => {
    const cp = clientPrincipalOf(request);
    const [client, shared, tasks, unread] = await Promise.all([
      prisma.client.findUnique({ where: { id: cp.clientId } }),
      prisma.session.findMany({ where: { clientId: cp.clientId, status: "shared" }, orderBy: { sharedAt: "desc" }, take: 1 }),
      prisma.actionItem.findMany({ where: { clientId: cp.clientId, visibility: "shared" }, orderBy: { createdAt: "desc" } }),
      prisma.clientMessage.count({ where: { clientId: cp.clientId, direction: "coach_to_client", readAt: null } }),
    ]);
    return {
      client: client ? { firstName: client.firstName } : null,
      lastSharedSessionId: shared[0]?.id ?? null,
      openTasks: tasks.filter((t) => t.status !== "completed").length,
      tasks,
      newReplies: unread,
    };
  });

  app.get("/v1/client-portal/summaries", { preHandler: app.authenticateClient }, async (request) => {
    const cp = clientPrincipalOf(request);
    const sessions = await prisma.session.findMany({
      where: { clientId: cp.clientId, status: "shared" },
      orderBy: { sharedAt: "desc" },
      select: { id: true, title: true, sharedAt: true, outputLanguage: true },
    });
    return { summaries: sessions };
  });

  app.get("/v1/client-portal/summaries/:sessionId", { preHandler: app.authenticateClient }, async (request) => {
    const cp = clientPrincipalOf(request);
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    // Only the client's own, actually-shared sessions.
    if (!session || session.clientId !== cp.clientId || session.status !== "shared") throw notFound("Not found");
    const summary = await prisma.summary.findFirst({ where: { sessionId, status: "approved" }, orderBy: { version: "desc" } });
    const content = (summary?.contentJson ?? {}) as Record<string, unknown>;
    return { session: { id: session.id, title: session.title, sharedAt: session.sharedAt }, shared: buildSharedSummary(session, content) };
  });

  // --- Tasks (client can update progress on shared tasks) ----------------
  app.get("/v1/client-portal/tasks", { preHandler: app.authenticateClient }, async (request) => {
    const cp = clientPrincipalOf(request);
    const tasks = await prisma.actionItem.findMany({
      where: { clientId: cp.clientId, visibility: "shared" },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return { tasks };
  });

  app.patch("/v1/client-portal/tasks/:id", { preHandler: app.authenticateClient }, async (request) => {
    const cp = clientPrincipalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(["pending", "in_progress", "completed"]) }).parse(request.body);
    const task = await prisma.actionItem.findUnique({ where: { id } });
    if (!task || task.clientId !== cp.clientId || task.visibility !== "shared") throw notFound("Task not found");
    const updated = await prisma.actionItem.update({ where: { id }, data: { status: body.status } });
    return { task: updated };
  });

  // --- Messages -----------------------------------------------------------
  app.get("/v1/client-portal/messages", { preHandler: app.authenticateClient }, async (request) => {
    const cp = clientPrincipalOf(request);
    return { messages: await messaging.threadForClient(cp.clientId) };
  });

  app.post("/v1/client-portal/messages", { preHandler: app.authenticateClient }, async (request, reply) => {
    const cp = clientPrincipalOf(request);
    const body = z.object({ body: z.string().min(1), urgent: z.boolean().default(false) }).safeParse(request.body);
    if (!body.success) throw badRequest("Message body is required", "validation_error");
    const client = await prisma.client.findUniqueOrThrow({ where: { id: cp.clientId } });
    const { message } = await messaging.submitFromClient(client, body.data);
    // The AI draft is intentionally NOT returned to the client — it is for the coach.
    return reply.code(201).send({ message: { id: message.id, status: "submitted", urgent: message.urgent } });
  });
}
