import { PrismaClient } from "@prisma/client";

/** Shared Prisma client. One instance per process. */
export const prisma = new PrismaClient();

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
