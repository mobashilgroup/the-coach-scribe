/**
 * Client messaging + AI reply drafts (Spec §8.4, §11.6).
 *
 * When a client sends a note, we (1) confirm the client↔coach link, (2) gather
 * minimized context from recent approved sessions, (3) ask the model for a
 * DRAFT reply, (4) store it for the coach and notify them. The draft is never
 * sent automatically — the coach must explicitly reply.
 */

import type { Client, PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { createAnalysisProvider, type ProviderConfig } from "../../domain/ai/providers/index.js";
import { REPLY_PROMPT_VERSION } from "../../domain/ai/prompts.js";
import { buildReplyContext, isClientLinkedToCoach, type ApprovedSummaryLike } from "../../domain/messaging/reply-context.js";
import { createEmailProvider, type EmailProvider } from "../../domain/notify/email.js";
import type { Principal } from "../../lib/context.js";
import { forbidden, notFound } from "../../lib/errors.js";

export class MessagingService {
  private readonly providerConfig: ProviderConfig;
  private readonly email: EmailProvider;
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {
    this.providerConfig = {
      transcription: env.TRANSCRIPTION_PROVIDER,
      analysis: env.ANALYSIS_PROVIDER,
      openaiApiKey: env.OPENAI_API_KEY,
      openaiModel: env.OPENAI_MODEL,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      anthropicModel: env.ANTHROPIC_MODEL,
    };
    this.email = createEmailProvider(env);
  }

  /** Client submits a note/question → AI draft prepared for the coach. */
  async submitFromClient(client: Client, input: { body: string; urgent: boolean }) {
    const message = await this.prisma.clientMessage.create({
      data: {
        clientId: client.id,
        coachId: client.primaryCoachId,
        direction: "client_to_coach",
        body: input.body,
        urgent: input.urgent,
        status: "submitted",
      },
    });

    // Gather minimized context from recent approved sessions (§11.6 steps 2–3).
    const sessions = await this.prisma.session.findMany({
      where: { clientId: client.id, status: { in: ["approved", "shared"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { summaries: { orderBy: { version: "desc" }, take: 1 } },
    });
    const approvedSummaries: ApprovedSummaryLike[] = sessions
      .map((s) => s.summaries[0])
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((sum) => ({ content: (sum.contentJson ?? {}) as Record<string, unknown>, createdAt: sum.createdAt }));

    const context = buildReplyContext(approvedSummaries);

    const analysis = createAnalysisProvider(this.providerConfig);
    const draftBody = await analysis.draftReply({
      clientMessage: input.body,
      context,
      outputLanguage: client.locale ?? "en",
      urgent: input.urgent,
    });

    const draft = await this.prisma.$transaction(async (tx) => {
      const d = await tx.aiReplyDraft.create({
        data: {
          clientMessageId: message.id,
          contextSessionIds: sessions.map((s) => s.id),
          draftBody,
          status: "ai_draft_ready",
          model: `${analysis.name}:${REPLY_PROMPT_VERSION}`,
        },
      });
      await tx.clientMessage.update({ where: { id: message.id }, data: { status: "ai_draft_ready" } });
      await tx.notification.create({
        data: {
          userId: client.primaryCoachId,
          type: input.urgent ? "client_message_urgent" : "client_message",
          title: input.urgent ? "Urgent message from a client" : "New message from a client",
          body: input.body.slice(0, 140),
          resourceType: "client_message",
          resourceId: message.id,
        },
      });
      return d;
    });

    // Best-effort email to the coach (in-app notification already persisted).
    if (this.email.name !== "noop") {
      try {
        const coach = await this.prisma.user.findUnique({ where: { id: client.primaryCoachId } });
        if (coach?.email) {
          await this.email.send({
            to: coach.email,
            subject: input.urgent ? "Urgent message from a client" : "New message from a client",
            text: `${client.firstName} sent you a message in The Coach Scribe. Open your dashboard to review the AI-suggested reply.`,
          });
        }
      } catch {
        // Never fail the client's action because email delivery hiccupped.
      }
    }

    return { message, draft };
  }

  async listForCoach(principal: Principal) {
    return this.prisma.clientMessage.findMany({
      where: { direction: "client_to_coach", client: { organizationId: principal.organizationId } },
      orderBy: [{ status: "asc" }, { sentAt: "desc" }],
      include: { client: true, drafts: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
  }

  async getForCoach(principal: Principal, id: string) {
    const message = await this.prisma.clientMessage.findUnique({
      where: { id },
      include: { client: true, drafts: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!message || message.client.organizationId !== principal.organizationId) throw notFound("Message not found");
    // Only the primary coach or an org admin may act on it.
    if (!isClientLinkedToCoach(null, message.client.primaryCoachId, principal.userId) && principal.role === "coach") {
      throw forbidden("Not your client");
    }
    return message;
  }

  /** Coach reviews the draft and sends a reply (possibly edited). Never automatic. */
  async replyAsCoach(principal: Principal, id: string, body: string) {
    const message = await this.getForCoach(principal, id);
    const reply = await this.prisma.$transaction(async (tx) => {
      const r = await tx.clientMessage.create({
        data: {
          clientId: message.clientId,
          coachId: principal.userId,
          direction: "coach_to_client",
          body,
          status: "sent",
        },
      });
      await tx.clientMessage.update({ where: { id: message.id }, data: { status: "sent", readAt: new Date() } });
      const latestDraft = message.drafts[0];
      if (latestDraft) {
        await tx.aiReplyDraft.update({
          where: { id: latestDraft.id },
          data: { status: "sent", reviewedBy: principal.userId, sentMessageId: r.id },
        });
      }
      return r;
    });
    return reply;
  }

  async threadForClient(clientId: string) {
    return this.prisma.clientMessage.findMany({
      where: { clientId },
      orderBy: { sentAt: "asc" },
      select: { id: true, direction: true, body: true, urgent: true, status: true, sentAt: true },
    });
  }
}
