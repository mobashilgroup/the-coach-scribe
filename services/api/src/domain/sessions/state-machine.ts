/**
 * Session state machine (Master Spec §17.1).
 *
 * Every transition is validated server-side; illegal transitions throw. The
 * happy path is:
 *
 *   draft → consent_pending → consented → recording|uploading → uploaded
 *        → transcribing → transcription_ready → summarizing → review_required
 *        → approved → shared → archived
 *
 * Parallel failure/terminal states: failed_upload, failed_transcription,
 * failed_summary, cancelled, deleted.
 */

export type SessionStatus =
  | "draft"
  | "consent_pending"
  | "consented"
  | "recording"
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "transcription_ready"
  | "summarizing"
  | "review_required"
  | "approved"
  | "shared"
  | "archived"
  | "failed_upload"
  | "failed_transcription"
  | "failed_summary"
  | "cancelled"
  | "deleted";

/** Allowed successor states for each state. */
const TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  draft: ["consent_pending", "recording", "uploading", "cancelled", "deleted"],
  consent_pending: ["consented", "cancelled", "deleted"],
  consented: ["recording", "uploading", "cancelled", "deleted"],
  recording: ["uploading", "uploaded", "failed_upload", "cancelled"],
  uploading: ["uploaded", "failed_upload", "cancelled"],
  uploaded: ["transcribing", "cancelled", "deleted"],
  transcribing: ["transcription_ready", "failed_transcription"],
  transcription_ready: ["summarizing", "cancelled", "deleted"],
  summarizing: ["review_required", "failed_summary"],
  review_required: ["approved", "summarizing", "cancelled", "deleted"],
  approved: ["shared", "review_required", "archived", "deleted"],
  shared: ["archived", "approved", "deleted"],
  archived: ["deleted"],
  // Recoverable failures: retry re-enters the pipeline (Spec §28.3/§28.4).
  failed_upload: ["uploading", "cancelled", "deleted"],
  failed_transcription: ["transcribing", "cancelled", "deleted"],
  failed_summary: ["summarizing", "cancelled", "deleted"],
  cancelled: ["deleted"],
  deleted: [],
};

/** Terminal states have no outgoing transitions worth acting on. */
export const TERMINAL_STATES: ReadonlySet<SessionStatus> = new Set(["deleted"]);

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStates(from: SessionStatus): readonly SessionStatus[] {
  return TRANSITIONS[from];
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: SessionStatus,
    public readonly to: SessionStatus,
  ) {
    super(`Invalid session transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Assert a transition is legal, throwing InvalidTransitionError otherwise. */
export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * The point at which a session is "consumed" for quota purposes: it has entered
 * processing successfully (Spec §13.5 — a session is charged when it enters
 * processing, NOT when Record is pressed, and a system-failed job never charges).
 */
export function consumesQuotaOnEnter(status: SessionStatus): boolean {
  return status === "transcribing";
}

/** States that represent a system failure (do not consume quota). */
export function isFailure(status: SessionStatus): boolean {
  return (
    status === "failed_upload" ||
    status === "failed_transcription" ||
    status === "failed_summary"
  );
}
