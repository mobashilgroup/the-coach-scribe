import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { principalOf } from "../../plugins/auth.js";
import { requireClientInOrg } from "../../lib/context.js";
import { badRequest, notFound } from "../../lib/errors.js";

const CreateBody = z.object({
  clientId: z.string(),
  title: z.string().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().default("UTC"),
  location: z.string().optional(),
  meetingUrl: z.string().optional(),
  notes: z.string().optional(),
});

export function appointmentRoutes(app: FastifyInstance, deps: { prisma: PrismaClient }): void {
  const { prisma } = deps;

  app.get("/v1/appointments", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const query = z.object({ clientId: z.string().optional(), upcoming: z.coerce.boolean().optional() }).parse(request.query);
    const appointments = await prisma.appointment.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.upcoming ? { startsAt: { gte: new Date() }, status: { not: "cancelled" } } : {}),
      },
      orderBy: { startsAt: "asc" },
    });
    return { appointments };
  });

  app.post("/v1/appointments", { preHandler: app.authenticate }, async (request, reply) => {
    const principal = principalOf(request);
    const parsed = CreateBody.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input", "validation_error");
    if (parsed.data.endsAt <= parsed.data.startsAt) throw badRequest("End must be after start", "invalid_range");
    await requireClientInOrg(prisma, principal, parsed.data.clientId);

    const appointment = await prisma.appointment.create({
      data: {
        organizationId: principal.organizationId,
        coachId: principal.userId,
        clientId: parsed.data.clientId,
        title: parsed.data.title,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        timezone: parsed.data.timezone,
        location: parsed.data.location,
        meetingUrl: parsed.data.meetingUrl,
        notes: parsed.data.notes,
      },
    });
    // Successfully Booked (Spec §10.23). Calendar sync fills providerEventId later.
    return reply.code(201).send({ appointment });
  });

  app.patch("/v1/appointments/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== principal.organizationId) throw notFound("Appointment not found");
    const body = z
      .object({
        title: z.string().optional(),
        startsAt: z.coerce.date().optional(),
        endsAt: z.coerce.date().optional(),
        location: z.string().optional(),
        meetingUrl: z.string().optional(),
        notes: z.string().optional(),
        status: z.enum(["booked", "completed", "cancelled", "no_show"]).optional(),
      })
      .parse(request.body);
    const appointment = await prisma.appointment.update({ where: { id }, data: body });
    return { appointment };
  });

  app.delete("/v1/appointments/:id", { preHandler: app.authenticate }, async (request) => {
    const principal = principalOf(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== principal.organizationId) throw notFound("Appointment not found");
    const appointment = await prisma.appointment.update({ where: { id }, data: { status: "cancelled" } });
    return { appointment };
  });
}
