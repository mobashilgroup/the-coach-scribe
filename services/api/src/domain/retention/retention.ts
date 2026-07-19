/**
 * Retention scheduling (Master Spec §15.4, §34).
 *
 * By default audio is kept only long enough to transcribe and validate, then
 * scheduled for deletion; transcripts are kept for a configurable window
 * (30 or 90 days). All values are configuration, never hardcoded business rules.
 */

export interface RetentionConfig {
  /** Delete source audio this many hours after successful processing. */
  audioDeleteAfterHours: number;
  /** Keep transcripts this many days (e.g. 30 or 90). */
  transcriptRetentionDays: number;
}

/** When the audio file for a just-processed session should be deleted. */
export function audioDeleteAt(config: RetentionConfig, processedAt: Date): Date {
  return new Date(processedAt.getTime() + config.audioDeleteAfterHours * 60 * 60 * 1000);
}

/** When a transcript created now should expire (unless legally held or manually kept). */
export function transcriptExpiresAt(config: RetentionConfig, createdAt: Date): Date {
  return new Date(createdAt.getTime() + config.transcriptRetentionDays * 24 * 60 * 60 * 1000);
}

/** Whether a scheduled deletion time has arrived. */
export function isDue(deleteAt: Date | null, now: Date): boolean {
  return deleteAt !== null && deleteAt.getTime() <= now.getTime();
}
