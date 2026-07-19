import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { principalOf } from "../../plugins/auth.js";
import { assertCanMutateSession, requireClientInOrg, requireSessionInOrg } from "../../lib/context.js";
import { badRequest } from "../../lib/errors.js";
import { SessionService } from "./sessions.service.js";

const InputMethod = z.enum([
  "record_audio",
  "upload_audio",
  "upload_video",
  "upload_document",
  "photo",
  "free_text",
]);

const CreateSessionBody = z.object({
  clientId: z.string(),
  inputMethod: InputMethod,
  title: z.string().optional(),
  sessionType: z.string().optional(),
  languageSpoken: z.string().optional(),
  outputLanguage: z.string().default("en"),
  freeText: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

export function sessionRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; env: Env }): void {
  const { prisma, env } = deps;
  const service = new SessionService(prisma, env);

  app.post("/v1/sessions", { preHandler: app.authenticate }, async (request, reply) => {
    const principal = principalOf(request);
    const parsed = CreateSessionBody.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input", "validation_error");
    await requireClientInOrg(prisma, principal, parsed.data.clientId);

    const session = await prisma.session.create({
      data: {
        organizationId: principal.organizationId,
        coachId: principal.userId,
        clientId: parsed.data.clientId,
        title: parsed.data.title,
        sessionType: parsed.data.sessionType,
        inputMethod: parsed.data.inputMethod,
        languageSpoken: parsed.data.languageSpoken,
        outputLanguage: parsed.data.outputLanguage,
        freeText: parsed.data.freeText,
        durationSeconds: parsed.data.durationSeconds,
        status: "draft",
      },
    });
    return reply.code(201).send({ session });
  });

  app.get("/v1/sessions", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const query = z.object({ clientId: z.string().optional(), status: z.string().optional() }).parse(request.query);
    const sessions = await prisma.session.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
        status: { not: "deleted" },
      },
      orderBy: { createdAt: "desc" },
    });
    return { sessions };
  });

  app.get("/v1/sessions/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = await requireSessionInOrg(prisma, principal, id);
    const [summary, segments, speakers] = await Promise.all([
      prisma.summary.findFirst({ where: { sessionId: id }, orderBy: { version: "desc" } }),
      prisma.transcriptSegment.findMany({ where: { sessionId: id }, orderBy: { startMs: "asc" } }),
      prisma.speaker.findMany({ where: { sessionId: id } }),
    ]);
    return { session, summary, transcript: segments, speakers };
  });

  app.post("/v1/sessions/:id/consent", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ method: z.string().optional(), confirmed: z.literal(true) }).safeParse(request.body);
    if (!body.success) throw badRequest("Consent must be confirmed", "consent_not_confirmed");
    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);
    await service.recordConsent(session, {
      acceptedBy: principal.userId,
      method: body.data.method,
      ip: request.ip,
    });
    const updated = await prisma.session.findUnique({ where: { id } });
    return { session: updated };
  });

  app.post("/v1/sessions/:id/process", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);
    const { summaryId } = await service.processSession(session);
    const updated = await prisma.session.findUnique({ where: { id } });
    const summary = await prisma.summary.findUnique({ where: { id: summaryId } });
    return { session: updated, summary };
  });

  // Retry re-enters the pipeline from a failure state (Spec §28.3/§28.4).
  app.post("/v1/sessions/:id/retry", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);
    const { summaryId } = await service.processSession(session);
    const updated = await prisma.session.findUnique({ where: { id } });
    const summary = await prisma.summary.findUnique({ where: { id: summaryId } });
    return { session: updated, summary };
  });
}
