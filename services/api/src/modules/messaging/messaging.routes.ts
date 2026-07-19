import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { principalOf } from "../../plugins/auth.js";
import { badRequest } from "../../lib/errors.js";
import { MessagingService } from "./messaging.service.js";

export function messagingRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; env: Env }): void {
  const { prisma, env } = deps;
  const service = new MessagingService(prisma, env);

  // Coach inbox of client messages (with the latest AI draft attached).
  app.get("/v1/messages", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const messages = await service.listForCoach(principal);
    return { messages };
  });

  app.get("/v1/messages/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const message = await service.getForCoach(principal, id);
    const thread = await service.threadForClient(message.clientId);
    return { message, thread };
  });

  // Coach reviews the AI draft and sends a reply (possibly edited). Never auto-sent.
  app.post("/v1/messages/:id/reply", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ body: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw badRequest("Reply body is required", "validation_error");
    const reply = await service.replyAsCoach(principal, id, body.data.body);
    return { reply };
  });
}

export function notificationRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }): void {
  const { prisma } = deps;

  app.get("/v1/notifications", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const notifications = await prisma.notification.findMany({
      where: { userId: principal.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { notifications, unread: notifications.filter((n) => !n.read).length };
  });

  app.post("/v1/notifications/:id/read", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== principal.userId) return { ok: true };
    await prisma.notification.update({ where: { id }, data: { read: true, readAt: new Date() } });
    return { ok: true };
  });
}
