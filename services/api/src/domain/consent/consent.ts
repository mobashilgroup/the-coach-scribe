/**
 * Consent gating (Master Spec §10.11, §24.1).
 *
 * The microphone / processing must not activate until valid consent exists for
 * the session. Consent can be captured per-session or carried over from a
 * still-valid prior consent for the same client.
 */

export interface ConsentRecord {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  consentTextVersion: string;
}

export interface ConsentPolicy {
  /** The legal text version currently in force. */
  currentTextVersion: string;
  /** Optional max age (days) after which a carried-over consent is stale. */
  maxAgeDays?: number;
}

/** A consent is valid if accepted, not revoked, on the current text version, and not stale. */
export function isConsentValid(
  consent: ConsentRecord | null | undefined,
  policy: ConsentPolicy,
  now: Date,
): boolean {
  if (!consent || !consent.acceptedAt) return false;
  if (consent.revokedAt) return false;
  if (consent.consentTextVersion !== policy.currentTextVersion) return false;
  if (policy.maxAgeDays !== undefined) {
    const ageMs = now.getTime() - consent.acceptedAt.getTime();
    const maxMs = policy.maxAgeDays * 24 * 60 * 60 * 1000;
    if (ageMs > maxMs) return false;
  }
  return true;
}

/** Whether recording/processing may start (the "Continue" button gate). */
export function canStartRecording(
  consent: ConsentRecord | null | undefined,
  policy: ConsentPolicy,
  now: Date,
): boolean {
  return isConsentValid(consent, policy, now);
}
