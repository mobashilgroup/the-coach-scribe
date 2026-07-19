/**
 * Loads the effective Plan for an organization and its current usage, bridging
 * the database to the pure plans engine (Spec §13).
 */

import type { PrismaClient } from "@prisma/client";
import { parsePlan, type Plan } from "../../domain/plans/plans.js";
import { periodKey, sessionsUsedInPeriod, type UsageEntry } from "../../domain/usage/usage-ledger.js";

/** A permissive fallback used only when an org has no plan assigned yet. */
const FALLBACK_PLAN: Plan = parsePlan({
  id: "fallback",
  name: "unassigned",
  publicName: "Unassigned",
  limitsJson: { sessionsLimit: 0, sessionsWindow: "total", maxSessionMinutes: 60, clientsLimit: 0 },
  featuresJson: {},
});

export async function loadOrgPlan(prisma: PrismaClient, organizationId: string): Promise<Plan> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { plan: true },
  });
  if (!org?.plan) return FALLBACK_PLAN;
  return parsePlan(org.plan);
}

export async function currentSessionsUsed(
  prisma: PrismaClient,
  organizationId: string,
  plan: Plan,
  at: Date,
): Promise<number> {
  const period = periodKey(plan.limits.sessionsWindow, at);
  const rows = await prisma.usageLedger.findMany({
    where: { organizationId, metric: "session", period },
  });
  const entries: UsageEntry[] = rows.map((r) => ({
    metric: r.metric,
    quantity: r.quantity,
    period: r.period,
    reason: r.reason,
  }));
  return sessionsUsedInPeriod(entries, period);
}

export async function activeClientCount(prisma: PrismaClient, organizationId: string): Promise<number> {
  return prisma.client.count({ where: { organizationId, archivedAt: null } });
}
