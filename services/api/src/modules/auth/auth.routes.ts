import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { AuthService } from "./auth.service.js";
import { badRequest } from "../../lib/errors.js";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  organizationName: z.string().optional(),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function authRoutes(app: FastifyInstance, deps: { prisma: PrismaClient; env: Env }): void {
  const service = new AuthService(deps.prisma, deps.env);

  app.post("/v1/auth/register", async (request, reply) => {
    const parsed = RegisterBody.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input", "validation_error");
    const result = await service.register(parsed.data);
    return reply.code(201).send(result);
  });

  app.post("/v1/auth/login", async (request) => {
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) throw badRequest("Invalid input", "validation_error");
    return service.login(parsed.data.email, parsed.data.password);
  });
}
