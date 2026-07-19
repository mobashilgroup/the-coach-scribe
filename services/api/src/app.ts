import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { registerAuth } from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clientRoutes } from "./modules/clients/clients.routes.js";
import { sessionRoutes } from "./modules/sessions/sessions.routes.js";
import { summaryRoutes } from "./modules/summaries/summaries.routes.js";
import { taskRoutes } from "./modules/tasks/tasks.routes.js";

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

  registerAuth(app, { prisma, env });

  app.get("/health", async () => ({ status: "ok", env: env.APP_ENV }));

  // Feature modules.
  authRoutes(app, { prisma, env });
  clientRoutes(app, { prisma });
  sessionRoutes(app, { prisma, env });
  summaryRoutes(app, { prisma });
  taskRoutes(app, { prisma });

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
    app.log.error(error);
    return reply.code(500).send({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  return app;
}
