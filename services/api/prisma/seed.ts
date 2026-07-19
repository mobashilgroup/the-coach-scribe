/**
 * Seeds the launch plan catalogue (Spec §13.1). Prices are placeholders to be
 * set from admin (see docs/architecture/decisions-pending.md); limits/features
 * are configuration, not code.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLANS = [
  {
    name: "free_trial",
    publicName: "Free Trial",
    price: 0,
    limitsJson: { sessionsLimit: 3, sessionsWindow: "total", maxSessionMinutes: 30, clientsLimit: 3 },
    featuresJson: { clientPortal: false, integrations: false },
  },
  {
    name: "starter",
    publicName: "Starter",
    price: 0, // set from admin
    limitsJson: { sessionsLimit: 10, sessionsWindow: "month", maxSessionMinutes: 60, clientsLimit: null },
    featuresJson: { clientPortal: true, csvImport: true },
  },
  {
    name: "pro",
    publicName: "Pro",
    price: 0, // set from admin
    limitsJson: { sessionsLimit: 50, sessionsWindow: "month", maxSessionMinutes: 90, clientsLimit: null },
    featuresJson: { clientPortal: true, integrations: true, csvImport: true, brandKit: true, advancedAnalytics: true },
  },
];

async function main(): Promise<void> {
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { name: p.name },
      update: { publicName: p.publicName, limitsJson: p.limitsJson, featuresJson: p.featuresJson, active: true },
      create: { ...p, active: true },
    });
  }
  console.log(`Seeded ${PLANS.length} plans.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
