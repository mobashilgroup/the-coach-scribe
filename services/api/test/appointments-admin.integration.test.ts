/**
 * Appointments CRUD + admin console (live DB, opt-in via TCS_DB_TESTS=1).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv, resetEnvCache } from "../src/config/env.js";

const RUN = process.env.TCS_DB_TESTS === "1";
const d = RUN ? describe : describe.skip;

let app: FastifyInstance;
let prisma: PrismaClient;
const adminEmail = `admin_${Date.now()}@example.com`;

const post = (url: string, body: Record<string, unknown>, t?: string) =>
  app.inject({ method: "POST", url, payload: body, headers: t ? { authorization: `Bearer ${t}` } : {} });
const get = (url: string, t?: string) => app.inject({ method: "GET", url, headers: t ? { authorization: `Bearer ${t}` } : {} });

d("appointments + admin", () => {
  beforeAll(async () => {
    resetEnvCache();
    process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-1234";
    process.env.APP_ENV = "test";
    process.env.ADMIN_EMAILS = adminEmail;
    prisma = new PrismaClient();
    await prisma.plan.upsert({
      where: { name: "free_trial" }, update: {},
      create: { name: "free_trial", publicName: "Free Trial", price: 0, limitsJson: { sessionsLimit: 3, sessionsWindow: "total", clientsLimit: 3 }, featuresJson: {} },
    });
    app = buildApp({ prisma, env: loadEnv() });
    await app.ready();
  });
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });

  it("books, updates and cancels an appointment (org-scoped)", async () => {
    const reg = await post("/v1/auth/register", { email: adminEmail, password: "supersecret", firstName: "Ad", acceptedTerms: true });
    const token = reg.json().accessToken as string;
    const clientId = (await post("/v1/clients", { firstName: "Cli" }, token)).json().client.id as string;

    const created = await post("/v1/appointments", {
      clientId, title: "Session 1", startsAt: "2026-08-01T10:00:00Z", endsAt: "2026-08-01T11:00:00Z", timezone: "UTC",
    }, token);
    expect(created.statusCode).toBe(201);
    const apptId = created.json().appointment.id as string;

    // Invalid range is rejected.
    const bad = await post("/v1/appointments", { clientId, startsAt: "2026-08-01T11:00:00Z", endsAt: "2026-08-01T10:00:00Z" }, token);
    expect(bad.statusCode).toBe(400);

    const list = await get("/v1/appointments?upcoming=true", token);
    expect(list.json().appointments.length).toBeGreaterThanOrEqual(1);

    const cancelled = await app.inject({ method: "DELETE", url: `/v1/appointments/${apptId}`, headers: { authorization: `Bearer ${token}` } });
    expect(cancelled.json().appointment.status).toBe("cancelled");

    // A different org cannot see or touch it.
    const other = await post("/v1/auth/register", { email: `other_${Date.now()}@ex.com`, password: "supersecret", firstName: "Ot", acceptedTerms: true });
    const t2 = other.json().accessToken as string;
    const patchOther = await app.inject({ method: "PATCH", url: `/v1/appointments/${apptId}`, payload: { title: "hijack" }, headers: { authorization: `Bearer ${t2}` } });
    expect(patchOther.statusCode).toBe(404);
  });

  it("gates the admin console by the email allowlist", async () => {
    // The admin user (email is in ADMIN_EMAILS) can read the overview.
    const login = await post("/v1/auth/login", { email: adminEmail, password: "supersecret" });
    const adminToken = login.json().accessToken as string;
    const overview = await get("/v1/admin/overview", adminToken);
    expect(overview.statusCode).toBe(200);
    expect(overview.json().users).toBeGreaterThan(0);

    // Plan manager works.
    const plans = await get("/v1/admin/plans", adminToken);
    expect(plans.json().plans.length).toBeGreaterThanOrEqual(1);

    // Feature flags round-trip.
    const put = await app.inject({ method: "PUT", url: "/v1/admin/flags", payload: { clientPortal: true, whatsapp: false }, headers: { authorization: `Bearer ${adminToken}` } });
    expect(put.json().flags.clientPortal).toBe(true);

    // A non-allowlisted user is forbidden.
    const other = await post("/v1/auth/register", { email: `nonadmin_${Date.now()}@ex.com`, password: "supersecret", firstName: "No", acceptedTerms: true });
    const t2 = other.json().accessToken as string;
    expect((await get("/v1/admin/overview", t2)).statusCode).toBe(403);
  });
});
