/**
 * Session processing service — the heart of the flow (Spec §8.3, §14, §17).
 *
 * `processSession` runs the transcription + analysis pipeline and moves the
 * session through its states, enforcing consent and quota. In production this
 * body runs in a queue worker; for Milestone 1 it runs synchronously behind the
 * same service boundary, so the queue can be dropped in without changing callers.
 */

import type { Prisma, PrismaClient, Session } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { assertTransition, type SessionStatus } from "../../domain/sessions/state-machine.js";
import { evaluateSessionQuota, isSessionLengthAllowed } from "../../domain/plans/plans.js";
import { chargeSessionEntry, refundSessionEntry } from "../../domain/usage/usage-ledger.js";
import { isConsentValid } from "../../domain/consent/consent.js";
import {
  createAnalysisProvider,
  createTranscriptionProvider,
  type ProviderConfig,
} from "../../domain/ai/providers/index.js";
import { runAnalysis, runFullPipeline } from "../../domain/ai/pipeline.js";
import { SUMMARY_SCHEMA_VERSION } from "../../domain/ai/schema.js";
import { loadOrgPlan, currentSessionsUsed } from "../billing/plan-context.js";
import { badRequest, conflict, forbidden, paymentRequired } from "../../lib/errors.js";

const RECORDING_METHODS = new Set(["record_audio", "upload_audio", "upload_video"]);

/**
 * The valid chain of transitions to bring a session from a processable status
 * into the pipeline. Each hop is a legal transition in the state machine — we
 * walk the intermediate states rather than jumping straight to processing.
 * `failed_summary` re-enters at `summarizing` (its transcript already exists);
 * everything else runs the full transcribe→summarize pipeline.
 */
const ENTRY_PATHS: Partial<Record<SessionStatus, { steps: SessionStatus[]; mode: "full" | "summary_only" }>> = {
  draft: { steps: ["uploading", "uploaded", "transcribing"], mode: "full" },
  consented: { steps: ["uploading", "uploaded", "transcribing"], mode: "full" },
  uploaded: { steps: ["transcribing"], mode: "full" },
  failed_upload: { steps: ["uploading", "uploaded", "transcribing"], mode: "full" },
  failed_transcription: { steps: ["transcribing"], mode: "full" },
  failed_summary: { steps: ["summarizing"], mode: "summary_only" },
};

export class SessionService {
  private readonly providerConfig: ProviderConfig;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {
    this.providerConfig = {
      transcription: env.TRANSCRIPTION_PROVIDER,
      analysis: env.ANALYSIS_PROVIDER,
      deepgramApiKey: env.DEEPGRAM_API_KEY,
      deepgramModel: env.DEEPGRAM_MODEL,
      openaiApiKey: env.OPENAI_API_KEY,
      openaiModel: env.OPENAI_MODEL,
    };
  }

  /** Record consent for a session and advance to `consented`. */
  async recordConsent(
    session: Session,
    input: { acceptedBy: string; method?: string; ip?: string; device?: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.consent.create({
        data: {
          clientId: session.clientId,
          sessionId: session.id,
          consentType: "recording",
          consentTextVersion: this.env.CONSENT_TEXT_VERSION,
          acceptedAt: new Date(),
          acceptedBy: input.acceptedBy,
          method: input.method ?? "coach_checkbox",
          ip: input.ip,
          device: input.device,
        },
      });
      const from = session.status as SessionStatus;
      const to: SessionStatus = "consented";
      // draft → consent_pending → consented is the formal path; allow the
      // common shortcut draft/consent_pending → consented.
      if (from !== "consented") assertTransition(from === "draft" ? "consent_pending" : from, to);
      await tx.session.update({
        where: { id: session.id },
        data: { status: to },
      });
    });
  }

  async processSession(session: Session): Promise<{ summaryId: string }> {
    const status = session.status as SessionStatus;
    const entry = ENTRY_PATHS[status];
    if (!entry) {
      throw conflict(`Session cannot be processed from status ${status}`, "not_processable");
    }

    // Consent gate for recordings (Spec §10.11): never process without it.
    if (RECORDING_METHODS.has(session.inputMethod)) {
      const consent = session.consentId
        ? await this.prisma.consent.findUnique({ where: { id: session.consentId } })
        : await this.prisma.consent.findFirst({
            where: { sessionId: session.id },
            orderBy: { createdAt: "desc" },
          });
      const valid = isConsentValid(
        consent ? { acceptedAt: consent.acceptedAt, revokedAt: consent.revokedAt, consentTextVersion: consent.consentTextVersion } : null,
        { currentTextVersion: this.env.CONSENT_TEXT_VERSION },
        new Date(),
      );
      if (!valid) throw forbidden("Consent is required before processing this session", "consent_required");
    }

    if (session.inputMethod === "free_text" && !session.freeText?.trim()) {
      throw badRequest("Free-text session has no content", "empty_free_text");
    }

    // Session length cap (Spec §10.13).
    const minutes = Math.ceil((session.durationSeconds ?? 0) / 60);
    const plan = await loadOrgPlan(this.prisma, session.organizationId);
    if (minutes > 0 && !isSessionLengthAllowed(plan, minutes)) {
      throw paymentRequired(`Session exceeds the ${plan.limits.maxSessionMinutes}-minute limit for ${plan.publicName}`, "session_too_long");
    }

    // Quota gate (Spec §13.5): charged on entering processing, not on Record.
    const now = new Date();
    const used = await currentSessionsUsed(this.prisma, session.organizationId, plan, now);
    const quota = evaluateSessionQuota(plan, used);
    if (!quota.allowed) {
      // Never lose the recording; keep it and ask for an upgrade (Spec §28.6).
      throw paymentRequired(`Session limit reached for plan ${plan.publicName}`, "session_limit_reached");
    }

    // Enter processing by walking each valid transition, then charge usage
    // (Spec §13.5: consumed when it enters processing, not on Record).
    let from = status;
    for (const step of entry.steps) {
      assertTransition(from, step);
      from = step;
    }
    await this.prisma.$transaction(async (tx) => {
      let current = status;
      for (const step of entry.steps) {
        await tx.session.update({ where: { id: session.id }, data: { status: step } });
        current = step;
      }
      void current;
      const charge = chargeSessionEntry(plan.limits.sessionsWindow, now, session.id);
      await tx.usageLedger.create({
        data: {
          organizationId: session.organizationId,
          metric: charge.metric,
          quantity: charge.quantity,
          period: charge.period,
          sessionId: session.id,
          reason: charge.reason,
        },
      });
    });

    try {
      return await this.runPipelineAndPersist(session, entry.mode);
    } catch (err) {
      // System failure: refund the charge and record the failed state (Spec §28.3/§28.4).
      await this.prisma.$transaction(async (tx) => {
        const refund = refundSessionEntry(plan.limits.sessionsWindow, new Date(), session.id);
        await tx.usageLedger.create({
          data: {
            organizationId: session.organizationId,
            metric: refund.metric,
            quantity: refund.quantity,
            period: refund.period,
            sessionId: session.id,
            reason: refund.reason,
          },
        });
        // The DB status at failure time is the pipeline-entry state, so the
        // valid failure transition is failed_transcription (full) or
        // failed_summary (summary-only re-run).
        const failStatus: SessionStatus = entry.mode === "summary_only" ? "failed_summary" : "failed_transcription";
        await tx.session.update({ where: { id: session.id }, data: { status: failStatus } });
      });
      throw err;
    }
  }

  private async runPipelineAndPersist(
    session: Session,
    mode: "full" | "summary_only",
  ): Promise<{ summaryId: string }> {
    const transcription = createTranscriptionProvider(this.providerConfig);
    const analysis = createAnalysisProvider(this.providerConfig);

    let segments: { speakerLabel: string; startMs: number; endMs: number; text: string; confidence: number }[] = [];
    let speakers: string[] = [];
    let summaryResult;

    if (mode === "summary_only") {
      // Re-summarize from the existing transcript without re-transcribing.
      const stored = await this.prisma.transcriptSegment.findMany({
        where: { sessionId: session.id },
        orderBy: { startMs: "asc" },
      });
      const text = stored.length > 0 ? stored.map((s) => s.text).join("\n") : session.freeText ?? "";
      summaryResult = await runAnalysis(
        analysis,
        text,
        { outputLanguage: session.outputLanguage, sessionType: session.sessionType ?? undefined },
        { sourceIsFreeText: session.inputMethod === "free_text" },
      );
    } else if (session.inputMethod === "free_text") {
      // Notes path: no transcription; analyze the coach's text directly.
      summaryResult = await runAnalysis(
        analysis,
        session.freeText ?? "",
        { outputLanguage: session.outputLanguage, sessionType: session.sessionType ?? undefined },
        { sourceIsFreeText: true },
      );
    } else {
      const media = await this.prisma.sessionFile.findFirst({ where: { sessionId: session.id } });
      const mediaRef = media?.storageKey ?? `session:${session.id}`;
      const full = await runFullPipeline(transcription, analysis, {
        mediaRef,
        languageHint: session.languageSpoken ?? undefined,
        outputLanguage: session.outputLanguage,
        sessionType: session.sessionType ?? undefined,
      });
      segments = full.transcript.segments;
      speakers = full.transcript.speakers;
      summaryResult = full.result;
    }

    const summaryId = await this.prisma.$transaction(async (tx) => {
      if (mode === "full") {
        // transcribing → transcription_ready → summarizing (→ review_required below)
        await tx.session.update({ where: { id: session.id }, data: { status: "transcription_ready" } });

        if (speakers.length > 0) {
          await tx.speaker.createMany({ data: speakers.map((label) => ({ sessionId: session.id, label })) });
        }
        if (segments.length > 0) {
          await tx.transcriptSegment.createMany({
            data: segments.map((s) => ({
              sessionId: session.id,
              startMs: s.startMs,
              endMs: s.endMs,
              text: s.text,
              confidence: s.confidence,
            })),
          });
        }
        await tx.session.update({ where: { id: session.id }, data: { status: "summarizing" } });
      }

      const existingVersions = await tx.summary.count({ where: { sessionId: session.id } });
      const summary = await tx.summary.create({
        data: {
          sessionId: session.id,
          version: existingVersions + 1,
          schemaVersion: SUMMARY_SCHEMA_VERSION,
          contentJson: summaryResult.summary as unknown as Prisma.InputJsonValue,
          status: "review_required",
          modelProvider: summaryResult.modelProvider,
          promptVersion: summaryResult.promptVersion,
        },
      });

      // Materialize action items and goals only on the first summary, private
      // until shared (Spec §10.18). Re-runs don't duplicate them.
      if (existingVersions === 0) {
        for (const item of summaryResult.summary.action_items) {
          await tx.actionItem.create({
            data: {
              sessionId: session.id,
              clientId: session.clientId,
              title: item.title,
              ownerType: item.owner === "coach" ? "coach" : "client",
              visibility: "private",
              status: "pending",
            },
          });
        }
        for (const goal of summaryResult.summary.goals) {
          await tx.goal.create({
            data: {
              sessionId: session.id,
              clientId: session.clientId,
              title: goal.title,
              description: goal.description,
              visibility: "private",
            },
          });
        }
      }

      await tx.session.update({
        where: { id: session.id },
        data: { status: "review_required" },
      });
      await tx.auditLog.create({
        data: { organizationId: session.organizationId, actorId: session.coachId, action: "session.processed", resourceType: "session", resourceId: session.id },
      });
      return summary.id;
    });

    return { summaryId };
  }
}
