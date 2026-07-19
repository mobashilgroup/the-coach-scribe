/**
 * Background worker entrypoint (`pnpm worker`).
 *
 * Runs the retention sweep on an interval (Spec §15.4). This is where async job
 * consumers (BullMQ) will also live once QUEUE_DRIVER=bullmq is enabled; for now
 * session processing runs inline in the API and this worker handles retention.
 */

import { loadEnv } from "./config/env.js";
import { prisma, disconnect } from "./db.js";
import { LocalDiskStorage } from "./lib/storage.js";
import { RetentionService } from "./modules/retention/retention.service.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const storage = new LocalDiskStorage(env.STORAGE_DIR);
  const retention = new RetentionService(prisma, storage, {
    audioDeleteAfterHours: env.AUDIO_DELETE_AFTER_HOURS,
    transcriptRetentionDays: env.DEFAULT_RETENTION_DAYS,
  });

  let running = true;
  const stop = async () => {
    running = false;
    await disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(`[worker] started; retention sweep every ${env.RETENTION_SWEEP_SECONDS}s`);
  while (running) {
    try {
      const result = await retention.sweep();
      if (result.audioFilesDeleted || result.transcriptsPurged) {
        console.log(`[worker] retention: deleted ${result.audioFilesDeleted} audio, purged ${result.transcriptsPurged} transcripts`);
      }
    } catch (err) {
      console.error("[worker] retention sweep failed:", err);
    }
    await new Promise((r) => setTimeout(r, env.RETENTION_SWEEP_SECONDS * 1000));
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
