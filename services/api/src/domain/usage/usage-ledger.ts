/**
 * Usage accounting (Master Spec §13.5).
 *
 * Usage is an append-only ledger. Consumption is recorded once, when a session
 * enters processing; a system failure records a compensating reason and does
 * not count against quota. This module is the pure math over ledger rows.
 */

import type { SessionsWindow } from "../plans/plans.js";

export interface UsageEntry {
  metric: string;
  quantity: number;
  period: string;
  reason?: string | null;
}

export const SESSION_METRIC = "session";

/**
 * Period key for a metric window. `total` (trial lifetime) always maps to the
 * constant "total"; `month` maps to "YYYY-MM" in UTC.
 */
export function periodKey(window: SessionsWindow, at: Date): string {
  if (window === "total") return "total";
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Net sessions consumed in a window. Positive `session` quantities add;
 * negative ones (refunds for system-failed jobs) subtract. Never below zero.
 */
export function sessionsUsedInPeriod(entries: readonly UsageEntry[], period: string): number {
  const total = entries
    .filter((e) => e.metric === SESSION_METRIC && e.period === period)
    .reduce((sum, e) => sum + e.quantity, 0);
  return Math.max(0, total);
}

/** Ledger row charging one session as it enters processing. */
export function chargeSessionEntry(window: SessionsWindow, at: Date, sessionId: string): UsageEntry {
  return {
    metric: SESSION_METRIC,
    quantity: 1,
    period: periodKey(window, at),
    reason: `session:${sessionId}:processing_started`,
  };
}

/** Compensating row when a system failure means the session should not count. */
export function refundSessionEntry(window: SessionsWindow, at: Date, sessionId: string): UsageEntry {
  return {
    metric: SESSION_METRIC,
    quantity: -1,
    period: periodKey(window, at),
    reason: `session:${sessionId}:system_failure_refund`,
  };
}
