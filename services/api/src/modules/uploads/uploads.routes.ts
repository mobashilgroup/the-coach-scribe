import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { LocalDiskStorage } from "../../lib/storage.js";
import { principalOf } from "../../plugins/auth.js";
import { assertCanMutateSession, requireSessionInOrg } from "../../lib/context.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { UploadService, uploadKey } from "./uploads.service.js";

export function uploadRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; storage: LocalDiskStorage }): void {
  const { prisma, storage } = deps;
  const service = new UploadService(prisma, storage);

  app.post("/v1/sessions/:id/upload/init", { preHandler: app.authenticate }, async (request, reply) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        kind: z.string().optional(),
        totalSize: z.number().int().nonnegative(),
        totalChunks: z.number().int().positive(),
      })
      .safeParse(request.body);
    if (!body.success) throw badRequest("Invalid upload init", "validation_error");
    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);
    const file = await service.init(session, body.data);
    return reply.code(201).send({ uploadId: file.id, sessionFileId: file.id, totalChunks: body.data.totalChunks });
  });

  // Raw binary chunk. `application/octet-stream` is parsed to a Buffer (see app.ts).
  app.put("/v1/sessions/:id/upload/:uploadId/chunk/:index", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id, uploadId, index } = z
      .object({ id: z.string(), uploadId: z.string(), index: z.coerce.number().int().nonnegative() })
      .parse(request.params);
    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);
    const file = await prisma.sessionFile.findUnique({ where: { id: uploadId } });
    if (!file || file.sessionId !== id) throw notFound("Upload not found");
    const data = request.body as Buffer;
    await service.appendChunk(uploadKey(uploadId), index, data);
    return { received: index };
  });

  app.post("/v1/sessions/:id/upload/:uploadId/complete", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id, uploadId } = z.object({ id: z.string(), uploadId: z.string() }).parse(request.params);
    const body = z
      .object({ totalChunks: z.number().int().positive(), fileName: z.string().min(1), checksum: z.string().optional() })
      .safeParse(request.body);
    if (!body.success) throw badRequest("Invalid complete", "validation_error");
    const session = await requireSessionInOrg(prisma, principal, id);
    assertCanMutateSession(principal, session);
    const file = await prisma.sessionFile.findUnique({ where: { id: uploadId } });
    if (!file || file.sessionId !== id) throw notFound("Upload not found");
    const stored = await service.complete(session, file, body.data);
    const updated = await prisma.session.findUnique({ where: { id } });
    return { file: { id: stored.id, size: stored.size, checksum: stored.checksum, status: stored.status }, session: updated };
  });
}
