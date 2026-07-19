/**
 * Object storage abstraction (Spec §19.3, §19.4).
 *
 * Production uses an S3-compatible store; local development uses the disk
 * adapter below. Callers depend only on the interface, so swapping is a config
 * change. Storage is never public (Spec §19.5) — the API mediates all access.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface ObjectStorage {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Local-disk implementation. Chunk staging lives under `<base>/tmp`. */
export class LocalDiskStorage implements ObjectStorage {
  private readonly base: string;

  constructor(baseDir: string) {
    this.base = resolve(baseDir);
  }

  private path(key: string): string {
    // Prevent path traversal out of the base directory.
    const target = resolve(this.base, key.replace(/^\/+/u, ""));
    if (!target.startsWith(this.base)) throw new Error("Invalid storage key");
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    const p = this.path(key);
    if (existsSync(p)) await rm(p, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.path(key));
  }

  // --- Chunk staging for resumable uploads ---------------------------------

  private chunkDir(uploadId: string): string {
    return this.path(join("tmp", uploadId));
  }

  async appendChunk(uploadId: string, index: number, data: Buffer): Promise<void> {
    const dir = this.chunkDir(uploadId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${String(index).padStart(6, "0")}.part`), data);
  }

  /** Assemble staged chunks 0..count-1 in order into a single object. */
  async assembleChunks(uploadId: string, count: number, destKey: string): Promise<{ size: number; checksum: string }> {
    const dir = this.chunkDir(uploadId);
    const destPath = this.path(destKey);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, Buffer.alloc(0));
    const hash = createHash("sha256");
    let size = 0;
    for (let i = 0; i < count; i++) {
      const part = join(dir, `${String(i).padStart(6, "0")}.part`);
      if (!existsSync(part)) throw new Error(`Missing chunk ${i} for upload ${uploadId}`);
      const buf = await readFile(part);
      await appendFile(destPath, buf);
      hash.update(buf);
      size += buf.length;
    }
    await rm(dir, { recursive: true, force: true });
    return { size, checksum: hash.digest("hex") };
  }
}
