/**
 * Configurable plans engine (Master Spec §13).
 *
 * Plan names, prices, limits and features live in the database (`plans` table);
 * this module is the pure decision logic that reads a plan's `limitsJson` /
 * `featuresJson` and answers questions like "can this org start another
 * session?". It never touches the database or the network.
 *
 * The limit model is deliberately general (Spec §13.3): it can express the
 * launch plans (Free trial / Starter / Pro) and the full historical catalogue
 * (Free, Starter, Standard, Premium, Elite, Enterprise) by configuration alone.
 */

import { z } from "zod";

/** Window a session count resets over. `total` = lifetime (used by trials). */
export const SessionsWindow = z.enum(["month", "total"]);
export type SessionsWindow = z.infer<typeof SessionsWindow>;

export const PlanLimits = z.object({
  /** Max sessions per window. `null` = unlimited. */
  sessionsLimit: z.number().int().nonnegative().nullable().default(null),
  sessionsWindow: SessionsWindow.default("month"),
  /** Hard cap on a single recording/upload length. */
  maxSessionMinutes: z.number().int().positive().default(60),
  /** Storage cap in MB. `null` = unlimited. */
  storageMb: z.number().int().nonnegative().nullable().default(null),
  /** Max active (non-archived) clients. `null` = unlimited. */
  clientsLimit: z.number().int().nonnegative().nullable().default(null),
  /** Max org members. `null` = unlimited. */
  membersLimit: z.number().int().nonnegative().nullable().default(null),
  /** Reprocess/regenerate allowance separate from new sessions (Spec §13.5). */
  reprocessLimit: z.number().int().nonnegative().nullable().default(null),
});
export type PlanLimits = z.infer<typeof PlanLimits>;

/** Feature flags a plan may unlock (Spec §13.4). Unknown keys default false. */
export const PlanFeatures = z
  .object({
    clientPortal: z.boolean().default(false),
    integrations: z.boolean().default(false),
    csvImport: z.boolean().default(false),
    whiteLabel: z.boolean().default(false),
    brandKit: z.boolean().default(false),
    advancedAnalytics: z.boolean().default(false),
    prioritySupport: z.boolean().default(false),
    sso: z.boolean().default(false),
  })
  .passthrough();
export type PlanFeatures = z.infer<typeof PlanFeatures>;

export interface Plan {
  id: string;
  name: string;
  publicName: string;
  limits: PlanLimits;
  features: PlanFeatures;
}

/** Parse the raw DB JSON columns into a typed, defaulted Plan. */
export function parsePlan(row: {
  id: string;
  name: string;
  publicName: string;
  limitsJson: unknown;
  featuresJson: unknown;
}): Plan {
  return {
    id: row.id,
    name: row.name,
    publicName: row.publicName,
    limits: PlanLimits.parse(row.limitsJson ?? {}),
    features: PlanFeatures.parse(row.featuresJson ?? {}),
  };
}

export interface QuotaResult {
  allowed: boolean;
  /** null when the metric is unlimited. */
  remaining: number | null;
  limit: number | null;
  used: number;
}

/**
 * Evaluate whether a new session may be started given current usage in the
 * relevant window. `used` is the count already consumed this window.
 */
export function evaluateSessionQuota(plan: Plan, used: number): QuotaResult {
  const limit = plan.limits.sessionsLimit;
  if (limit === null) {
    return { allowed: true, remaining: null, limit: null, used };
  }
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, remaining, limit, used };
}

/** Evaluate whether another active client may be added. */
export function evaluateClientQuota(plan: Plan, used: number): QuotaResult {
  const limit = plan.limits.clientsLimit;
  if (limit === null) {
    return { allowed: true, remaining: null, limit: null, used };
  }
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, remaining, limit, used };
}

/** Whether a requested recording length is within the plan's per-session cap. */
export function isSessionLengthAllowed(plan: Plan, minutes: number): boolean {
  return minutes <= plan.limits.maxSessionMinutes;
}

export function hasFeature(plan: Plan, key: keyof PlanFeatures | string): boolean {
  return plan.features[key] === true;
}

/**
 * Whether the coach is close enough to the session limit that the UI should
 * warn before they hit it (Spec §13.5 "mostrar consumo antes del límite").
 */
export function isApproachingSessionLimit(
  plan: Plan,
  used: number,
  thresholdFraction = 0.8,
): boolean {
  const limit = plan.limits.sessionsLimit;
  if (limit === null || limit === 0) return false;
  return used / limit >= thresholdFraction;
}
