import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { LocalDiskStorage } from "./lib/storage.js";
import { registerAuth } from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clientRoutes } from "./modules/clients/clients.routes.js";
import { sessionRoutes } from "./modules/sessions/sessions.routes.js";
import { summaryRoutes } from "./modules/summaries/summaries.routes.js";
import { taskRoutes } from "./modules/tasks/tasks.routes.js";
import { uploadRoutes } from "./modules/uploads/uploads.routes.js";
import { exportRoutes } from "./modules/exports/exports.routes.js";

export interface BuildOptions {
  prisma: PrismaClient;
  env: Env;
}

/** Build the Fastify app with all routes and the shared error handler. */
export function buildApp({ prisma, env }: BuildOptions): FastifyInstance {
  const app = Fastify({
    logger: env.APP_ENV === "test" ? false : { level: env.APP_ENV === "production" ? "info" : "debug" },
    // Fastify's default logging never records request bodies, so transcripts /
    // notes / prompts stay out of general logs (Spec §24.2).
  });

  app.register(cors, { origin: true });

  // Raw binary parser for resumable upload chunks (up to 12 MB per chunk).
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 12 * 1024 * 1024 }, (_req, body, done) => done(null, body));

  const storage = new LocalDiskStorage(env.STORAGE_DIR);

  registerAuth(app, { prisma, env });

  app.get("/health", async () => ({ status: "ok", env: env.APP_ENV }));

  // Feature modules.
  authRoutes(app, { prisma, env });
  clientRoutes(app, { prisma });
  sessionRoutes(app, { prisma, env });
  summaryRoutes(app, { prisma });
  taskRoutes(app, { prisma });
  uploadRoutes(app, { prisma, storage });
  exportRoutes(app, { prisma });

  // Optionally serve the coach web app (static, no build step) at /app.
  if (env.WEB_DIST_DIR) {
    // Dynamic import keeps @fastify/static optional when no web dir is set.
    void app.register(import("@fastify/static"), { root: env.WEB_DIST_DIR, prefix: "/app/" });
  }

  // Centralized error handling → stable JSON error shape.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    // Domain invariant violations surface as 409s.
    if (error.name === "InvalidTransitionError") {
      return reply.code(409).send({ error: { code: "invalid_transition", message: error.message } });
    }
    if ((error as { validation?: unknown }).validation) {
      return reply.code(400).send({ error: { code: "validation_error", message: error.message } });
    }
    // Honor Fastify errors that carry their own status (e.g. 413/415 on uploads).
    if (typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: { code: error.code ?? "request_error", message: error.message } });
    }
    app.log.error(error);
    return reply.code(500).send({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  return app;
}
