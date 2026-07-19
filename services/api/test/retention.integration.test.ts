/**
 * Retention sweep against a live database (opt-in via TCS_DB_TESTS=1).
 * Verifies due audio is deleted from storage + marked deleted + audited, and
 * that a file not yet due is left alone.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RetentionService } from "../src/modules/retention/retention.service.js";
import type { ObjectStorage } from "../src/lib/storage.js";

const RUN = process.env.TCS_DB_TESTS === "1";
const d = RUN ? describe : describe.skip;

let prisma: PrismaClient;

/** In-memory storage stub implementing the ObjectStorage interface. */
class MemStorage implements ObjectStorage {
  store = new Map<string, Buffer>();
  async put(k: string, data: Buffer) { this.store.set(k, data); }
  async get(k: string) { const v = this.store.get(k); if (!v) throw new Error("missing"); return v; }
  async delete(k: string) { this.store.delete(k); }
  async exists(k: string) { return this.store.has(k); }
}

async function makeOrgAndSession() {
  const user = await prisma.user.create({ data: { email: `ret_${Date.now()}_${Math.round(performance.now())}@ex.com`, firstName: "R" } });
  const org = await prisma.organization.create({ data: { name: "R", slug: `r-${user.id}`, ownerUserId: user.id } });
  const client = await prisma.client.create({ data: { organizationId: org.id, primaryCoachId: user.id, firstName: "C" } });
  const session = await prisma.session.create({
    data: { organizationId: org.id, coachId: user.id, clientId: client.id, inputMethod: "upload_audio", status: "review_required" },
  });
  return { org, session };
}

d("retention sweep", () => {
  beforeAll(() => { prisma = new PrismaClient(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("deletes due audio, records an audit entry, and spares not-yet-due files", async () => {
    const storage = new MemStorage();
    const service = new RetentionService(prisma, storage, { audioDeleteAfterHours: 24, transcriptRetentionDays: 90 });
    const { org, session } = await makeOrgAndSession();

    const dueKey = `${org.id}/${session.id}/due.m4a`;
    const futureKey = `${org.id}/${session.id}/future.m4a`;
    await storage.put(dueKey, Buffer.from("audio"));
    await storage.put(futureKey, Buffer.from("audio"));

    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3_600_000);
    const dueFile = await prisma.sessionFile.create({
      data: { sessionId: session.id, kind: "audio", storageKey: dueKey, mimeType: "audio/mp4", size: 5, status: "stored", retentionDeleteAt: past },
    });
    const futureFile = await prisma.sessionFile.create({
      data: { sessionId: session.id, kind: "audio", storageKey: futureKey, mimeType: "audio/mp4", size: 5, status: "stored", retentionDeleteAt: future },
    });

    const result = await service.sweep(new Date());
    expect(result.audioFilesDeleted).toBeGreaterThanOrEqual(1);

    const dueAfter = await prisma.sessionFile.findUniqueOrThrow({ where: { id: dueFile.id } });
    expect(dueAfter.status).toBe("deleted");
    expect(dueAfter.storageKey).toBe("");
    expect(storage.store.has(dueKey)).toBe(false);

    const futureAfter = await prisma.sessionFile.findUniqueOrThrow({ where: { id: futureFile.id } });
    expect(futureAfter.status).toBe("stored");
    expect(storage.store.has(futureKey)).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { action: "retention.audio_deleted", resourceId: dueFile.id } });
    expect(audit).not.toBeNull();
  });
});
