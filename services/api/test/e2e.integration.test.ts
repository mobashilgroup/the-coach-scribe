/**
 * End-to-end integration test against a live PostgreSQL database.
 *
 * Opt in with `TCS_DB_TESTS=1` and a `DATABASE_URL` pointing at a disposable
 * database (the CI/dev Postgres). It exercises the mandatory flow from Spec §8.3
 * and §29.3, plus the tenant-isolation guarantee from §16.2.
 *
 * When TCS_DB_TESTS is not set the suite is skipped, so `pnpm test` stays green
 * with no infrastructure.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv, resetEnvCache } from "../src/config/env.js";

const RUN = process.env.TCS_DB_TESTS === "1";
const d = RUN ? describe : describe.skip;

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

let app: FastifyInstance;
let prisma: PrismaClient;

async function seedPlans(p: PrismaClient) {
  await p.plan.upsert({
    where: { name: "free_trial" },
    update: {},
    create: {
      name: "free_trial",
      publicName: "Free Trial",
      price: 0,
      limitsJson: { sessionsLimit: 3, sessionsWindow: "total", maxSessionMinutes: 30, clientsLimit: 3 },
      featuresJson: {},
    },
  });
}

function post(path: string, body: Record<string, unknown>, token?: string): Promise<InjectResponse> {
  return app.inject({
    method: "POST",
    url: path,
    payload: body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}
function get(path: string, token?: string): Promise<InjectResponse> {
  return app.inject({ method: "GET", url: path, headers: token ? { authorization: `Bearer ${token}` } : {} });
}

d("end-to-end coach flow", () => {
  beforeAll(async () => {
    resetEnvCache();
    process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-1234";
    process.env.APP_ENV = "test";
    process.env.TRANSCRIPTION_PROVIDER = "fake";
    process.env.ANALYSIS_PROVIDER = "fake";
    prisma = new PrismaClient();
    await seedPlans(prisma);
    app = buildApp({ prisma, env: loadEnv() });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it("runs register → client → session → process → approve → share, then blocks cross-tenant access", async () => {
    const email = `coach_${Date.now()}@example.com`;

    // 1. Register coach (gets Free Trial + owner membership).
    const reg = await post("/v1/auth/register", {
      email,
      password: "supersecret",
      firstName: "Ada",
      acceptedTerms: true,
      organizationName: "Ada Coaching",
    });
    expect(reg.statusCode).toBe(201);
    const token = reg.json().accessToken as string;
    expect(token).toBeTruthy();

    // 2. Create a client.
    const clientRes = await post("/v1/clients", { firstName: "Grace", email: "grace@example.com" }, token);
    expect(clientRes.statusCode).toBe(201);
    const clientId = clientRes.json().client.id as string;

    // 3. Create a free-text session.
    const sessionRes = await post(
      "/v1/sessions",
      { clientId, inputMethod: "free_text", freeText: "Client set two goals and felt motivated.", outputLanguage: "en" },
      token,
    );
    expect(sessionRes.statusCode).toBe(201);
    const sessionId = sessionRes.json().session.id as string;
    expect(sessionRes.json().session.status).toBe("draft");

    // 4. Process → structured summary in review_required (no auto-share).
    const processRes = await post(`/v1/sessions/${sessionId}/process`, {}, token);
    expect(processRes.statusCode).toBe(200);
    expect(processRes.json().session.status).toBe("review_required");
    expect(processRes.json().summary.status).toBe("review_required");
    expect(processRes.json().summary.contentJson.action_items.length).toBeGreaterThan(0);

    // Tasks were materialized as private.
    const tasks = await get(`/v1/tasks?clientId=${clientId}`, token);
    expect(tasks.json().tasks.length).toBeGreaterThan(0);
    expect(tasks.json().tasks[0].visibility).toBe("private");

    // 5. Sharing before approval is forbidden by the state machine.
    const earlyShare = await post(`/v1/sessions/${sessionId}/share`, {}, token);
    expect(earlyShare.statusCode).toBe(409);

    // 6. Approve, then share selected fields.
    const approve = await post(`/v1/sessions/${sessionId}/summary/approve`, {}, token);
    expect(approve.statusCode).toBe(200);
    expect(approve.json().session.status).toBe("approved");

    const share = await post(`/v1/sessions/${sessionId}/share`, { include: { tasks: true } }, token);
    expect(share.statusCode).toBe(200);
    expect(share.json().session.status).toBe("shared");

    // 7. Usage was charged exactly once (Spec §13.5).
    const usage = await prisma.usageLedger.findMany({ where: { sessionId } });
    const net = usage.reduce((s, r) => s + r.quantity, 0);
    expect(net).toBe(1);

    // 8. Tenant isolation: a second coach cannot read the first coach's client.
    const reg2 = await post("/v1/auth/register", {
      email: `intruder_${Date.now()}@example.com`,
      password: "supersecret",
      firstName: "Mallory",
      acceptedTerms: true,
    });
    const token2 = reg2.json().accessToken as string;
    const crossTenant = await get(`/v1/clients/${clientId}`, token2);
    expect(crossTenant.statusCode).toBe(404); // not 403 — existence is hidden
    const crossSession = await get(`/v1/sessions/${sessionId}`, token2);
    expect(crossSession.statusCode).toBe(404);
  });

  it("enforces the Free Trial session cap and never loses the recording", async () => {
    const reg = await post("/v1/auth/register", {
      email: `capped_${Date.now()}@example.com`,
      password: "supersecret",
      firstName: "Cap",
      acceptedTerms: true,
    });
    const token = reg.json().accessToken as string;
    const clientId = (await post("/v1/clients", { firstName: "C" }, token)).json().client.id as string;

    // Free Trial allows 3 sessions total. Process 3, then the 4th is blocked.
    for (let i = 0; i < 3; i++) {
      const s = await post("/v1/sessions", { clientId, inputMethod: "free_text", freeText: `note ${i}` }, token);
      const id = s.json().session.id as string;
      const p = await post(`/v1/sessions/${id}/process`, {}, token);
      expect(p.statusCode).toBe(200);
    }
    const fourth = await post("/v1/sessions", { clientId, inputMethod: "free_text", freeText: "one too many" }, token);
    const fourthId = fourth.json().session.id as string;
    const blocked = await post(`/v1/sessions/${fourthId}/process`, {}, token);
    expect(blocked.statusCode).toBe(402); // upgrade required
    // The session is preserved, not destroyed.
    const still = await get(`/v1/sessions/${fourthId}`, token);
    expect(still.statusCode).toBe(200);
    expect(still.json().session.status).toBe("draft");
  });
});
