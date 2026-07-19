import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { principalOf } from "../../plugins/auth.js";
import { assertCanMutateSession, requireSessionInOrg } from "../../lib/context.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { assertTransition, type SessionStatus } from "../../domain/sessions/state-machine.js";
import { parseOrRepairSummary, SUMMARY_SCHEMA_VERSION } from "../../domain/ai/schema.js";

export function summaryRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }): void {
  const { prisma } = deps;

  app.get("/v1/sessions/:id/summary", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await requireSessionInOrg(prisma, principal, id);
    const summary = await prisma.summary.findFirst({ where: { sessionId: id }, orderBy: { version: "desc" } });
    if (!summary) throw notFound("No summary yet");
    return { summary };
  });

  // Coach edits the summary → stored as a new version, never overwriting (Spec §10.18).
  app.patch("/v1/sessions/:id/summary", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);

    const latest = await prisma.summary.findFirst({ where: { sessionId: id }, orderBy: { version: "desc" } });
    if (!latest) throw notFound("No summary to edit");

    // Validate/repair the edited content against the schema.
    let content;
    try {
      content = parseOrRepairSummary(request.body).value;
    } catch (err) {
      throw badRequest(`Invalid summary content: ${(err as Error).message}`, "invalid_summary");
    }

    const summary = await prisma.summary.create({
      data: {
        sessionId: id,
        version: latest.version + 1,
        schemaVersion: SUMMARY_SCHEMA_VERSION,
        contentJson: content as unknown as Prisma.InputJsonValue,
        status: "review_required",
        modelProvider: latest.modelProvider,
        promptVersion: latest.promptVersion,
      },
    });
    // Editing an approved summary returns it to review.
    if (session.status === "approved" || session.status === "shared") {
      await prisma.session.update({ where: { id }, data: { status: "review_required" } });
    }
    return { summary };
  });

  // Human approval — required before anything can be shared (Spec §14.5).
  app.post("/v1/sessions/:id/summary/approve", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);
    assertTransition(session.status as SessionStatus, "approved");

    const latest = await prisma.summary.findFirst({ where: { sessionId: id }, orderBy: { version: "desc" } });
    if (!latest) throw conflict("Nothing to approve", "no_summary");

    await prisma.$transaction([
      prisma.summary.update({ where: { id: latest.id }, data: { status: "approved", approvedBy: principal.userId, approvedAt: new Date() } }),
      prisma.session.update({ where: { id }, data: { status: "approved" } }),
      prisma.auditLog.create({ data: { organizationId: principal.organizationId, actorId: principal.userId, action: "summary.approve", resourceType: "session", resourceId: id } }),
    ]);
    const updated = await prisma.session.findUnique({ where: { id } });
    return { session: updated };
  });

  // Share — only after approval, and only the fields the coach selects (Spec §10.21).
  app.post("/v1/sessions/:id/share", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        include: z
          .object({
            summary: z.boolean().default(true),
            topics: z.boolean().default(true),
            tasks: z.boolean().default(true),
            goals: z.boolean().default(true),
            reflectionQuestions: z.boolean().default(false),
            transcript: z.boolean().default(false), // off by default
          })
          .default({}),
        channel: z.enum(["portal", "email", "link", "pdf"]).default("portal"),
      })
      .parse(request.body ?? {});

    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);
    // Enforces the no-auto-share rule: only approved sessions can transition.
    assertTransition(session.status as SessionStatus, "shared");

    // Mark selected tasks/goals as shared (private notes are never shareable).
    await prisma.$transaction(async (tx) => {
      if (body.include.tasks) {
        await tx.actionItem.updateMany({ where: { sessionId: id }, data: { visibility: "shared" } });
      }
      if (body.include.goals) {
        await tx.goal.updateMany({ where: { sessionId: id }, data: { visibility: "shared" } });
      }
      await tx.session.update({
        where: { id },
        data: { status: "shared", sharedAt: new Date(), sharedInclude: body.include as unknown as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          action: "session.share",
          resourceType: "session",
          resourceId: id,
          metadata: { channel: body.channel, include: body.include } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    const updated = await prisma.session.findUnique({ where: { id } });
    return { session: updated, shared: body.include, channel: body.channel };
  });
}
