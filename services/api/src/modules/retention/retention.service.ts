/**
 * Retention execution (Spec §15.4, §24.7). Runs as a background sweep:
 *  1. deletes audio whose retentionDeleteAt has passed (and records it);
 *  2. purges transcript segments for sessions older than the transcript window.
 * Every deletion is audited. Idempotent — a second sweep is a no-op.
 */

import type { PrismaClient } from "@prisma/client";
import type { ObjectStorage } from "../../lib/storage.js";
import { transcriptExpiresAt, isDue } from "../../domain/retention/retention.js";

export interface RetentionConfig {
  audioDeleteAfterHours: number;
  transcriptRetentionDays: number;
}

export interface SweepResult {
  audioFilesDeleted: number;
  transcriptsPurged: number;
}

export class RetentionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ObjectStorage,
    private readonly config: RetentionConfig,
  ) {}

  async sweep(now = new Date(), limit = 200): Promise<SweepResult> {
    const audioFilesDeleted = await this.deleteDueAudio(now, limit);
    const transcriptsPurged = await this.purgeExpiredTranscripts(now, limit);
    return { audioFilesDeleted, transcriptsPurged };
  }

  /** Delete stored files whose retentionDeleteAt has arrived. */
  private async deleteDueAudio(now: Date, limit: number): Promise<number> {
    const due = await this.prisma.sessionFile.findMany({
      where: { status: "stored", retentionDeleteAt: { lte: now } },
      take: limit,
      include: { session: true },
    });
    let count = 0;
    for (const file of due) {
      if (!isDue(file.retentionDeleteAt, now)) continue;
      if (file.storageKey) {
        try {
          await this.storage.delete(file.storageKey);
        } catch {
          // Best-effort: if the object is already gone, still mark it deleted.
        }
      }
      await this.prisma.$transaction([
        this.prisma.sessionFile.update({ where: { id: file.id }, data: { status: "deleted", storageKey: "" } }),
        this.prisma.auditLog.create({
          data: {
            organizationId: file.session.organizationId,
            action: "retention.audio_deleted",
            resourceType: "session_file",
            resourceId: file.id,
            metadata: { sessionId: file.sessionId },
          },
        }),
      ]);
      count++;
    }
    return count;
  }

  /** Purge transcript segments for sessions past the transcript retention window. */
  private async purgeExpiredTranscripts(now: Date, limit: number): Promise<number> {
    const cutoff = new Date(now.getTime() - this.config.transcriptRetentionDays * 24 * 60 * 60 * 1000);
    // Sessions created before the cutoff that still have transcript segments.
    const sessions = await this.prisma.session.findMany({
      where: { createdAt: { lt: cutoff }, status: { notIn: ["deleted"] }, segments: { some: {} } },
      take: limit,
      select: { id: true, organizationId: true, createdAt: true },
    });
    let count = 0;
    for (const s of sessions) {
      // Double-check with the pure policy function.
      if (!isDue(transcriptExpiresAt(this.config, s.createdAt), now)) continue;
      const del = await this.prisma.transcriptSegment.deleteMany({ where: { sessionId: s.id } });
      if (del.count > 0) {
        await this.prisma.auditLog.create({
          data: {
            organizationId: s.organizationId,
            action: "retention.transcript_purged",
            resourceType: "session",
            resourceId: s.id,
            metadata: { segments: del.count },
          },
        });
        count++;
      }
    }
    return count;
  }
}
