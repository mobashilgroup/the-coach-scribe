/**
 * Resumable, chunked upload (Spec §10.14, §15.1). Chunks are staged on the
 * storage backend and assembled on completion with a checksum. The session
 * walks draft/consented → uploading → uploaded.
 */

import type { PrismaClient, Session, SessionFile } from "@prisma/client";
import type { LocalDiskStorage } from "../../lib/storage.js";
import { assertTransition, type SessionStatus } from "../../domain/sessions/state-machine.js";
import { badRequest, conflict } from "../../lib/errors.js";

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 120) || "file";
}

export class UploadService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: LocalDiskStorage,
  ) {}

  async init(
    session: Session,
    input: { fileName: string; mimeType: string; kind?: string; totalSize: number },
  ): Promise<SessionFile> {
    const status = session.status as SessionStatus;
    if (status !== "uploading") {
      // Move into the uploading state (valid from draft and consented).
      assertTransition(status, "uploading");
      await this.prisma.session.update({ where: { id: session.id }, data: { status: "uploading" } });
    }
    const file = await this.prisma.sessionFile.create({
      data: {
        sessionId: session.id,
        kind: input.kind ?? "audio",
        storageKey: "", // set on completion
        mimeType: input.mimeType,
        size: input.totalSize,
        status: "uploading",
      },
    });
    return file;
  }

  async appendChunk(uploadId: string, index: number, data: Buffer): Promise<void> {
    if (!Buffer.isBuffer(data) || data.length === 0) throw badRequest("Empty chunk", "empty_chunk");
    await this.storage.appendChunk(uploadId, index, data);
  }

  async complete(
    session: Session,
    file: SessionFile,
    input: { totalChunks: number; fileName: string; checksum?: string },
  ): Promise<SessionFile> {
    if (file.status === "stored") return file; // idempotent
    const key = `${session.organizationId}/${session.id}/${file.id}/${safeName(input.fileName)}`;
    const { size, checksum } = await this.storage.assembleChunks(uploadKey(file.id), input.totalChunks, key);
    if (input.checksum && input.checksum !== checksum) {
      throw conflict("Uploaded file checksum mismatch", "checksum_mismatch");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const f = await tx.sessionFile.update({
        where: { id: file.id },
        data: { storageKey: key, size, checksum, status: "stored" },
      });
      // uploading → uploaded (only advance if still uploading).
      const fresh = await tx.session.findUniqueOrThrow({ where: { id: session.id } });
      if (fresh.status === "uploading") {
        assertTransition("uploading", "uploaded");
        await tx.session.update({ where: { id: session.id }, data: { status: "uploaded" } });
      }
      return f;
    });
    return updated;
  }
}

/** Chunk-staging id (kept distinct from the final storage key). */
export function uploadKey(fileId: string): string {
  return fileId;
}
