import { describe, expect, it } from "vitest";
import {
  evaluateClientQuota,
  evaluateSessionQuota,
  hasFeature,
  isApproachingSessionLimit,
  isSessionLengthAllowed,
  parsePlan,
  type Plan,
} from "./plans.js";

const freeTrial = parsePlan({
  id: "p_free",
  name: "free_trial",
  publicName: "Free Trial",
  limitsJson: { sessionsLimit: 3, sessionsWindow: "total", maxSessionMinutes: 30 },
  featuresJson: {},
});

const pro = parsePlan({
  id: "p_pro",
  name: "pro",
  publicName: "Pro",
  limitsJson: { sessionsLimit: 50, maxSessionMinutes: 90, clientsLimit: null },
  featuresJson: { clientPortal: true, integrations: true },
});

const enterprise = parsePlan({
  id: "p_ent",
  name: "enterprise",
  publicName: "Enterprise",
  limitsJson: { sessionsLimit: null, maxSessionMinutes: 180 },
  featuresJson: { sso: true, whiteLabel: true },
});

describe("parsePlan", () => {
  it("applies safe defaults for missing limit fields", () => {
    const p = parsePlan({
      id: "x",
      name: "x",
      publicName: "X",
      limitsJson: {},
      featuresJson: {},
    });
    expect(p.limits.sessionsLimit).toBeNull();
    expect(p.limits.maxSessionMinutes).toBe(60);
    expect(p.limits.sessionsWindow).toBe("month");
  });

  it("tolerates null json columns", () => {
    const p = parsePlan({
      id: "x",
      name: "x",
      publicName: "X",
      limitsJson: null,
      featuresJson: null,
    });
    expect(p.features.clientPortal).toBe(false);
  });
});

describe("evaluateSessionQuota", () => {
  it("allows while under the limit and reports remaining", () => {
    const r = evaluateSessionQuota(freeTrial, 1);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
    expect(r.limit).toBe(3);
  });

  it("blocks exactly at the limit (used === limit)", () => {
    const r = evaluateSessionQuota(freeTrial, 3);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("never reports negative remaining when over", () => {
    const r = evaluateSessionQuota(freeTrial, 5);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("treats null sessionsLimit as unlimited", () => {
    const r = evaluateSessionQuota(enterprise, 10_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBeNull();
    expect(r.limit).toBeNull();
  });
});

describe("evaluateClientQuota", () => {
  it("is unlimited when clientsLimit is null", () => {
    expect(evaluateClientQuota(pro, 999).allowed).toBe(true);
  });

  it("blocks at the client cap", () => {
    const capped = parsePlan({
      id: "s",
      name: "starter",
      publicName: "Starter",
      limitsJson: { clientsLimit: 3 },
      featuresJson: {},
    });
    expect(evaluateClientQuota(capped, 2).allowed).toBe(true);
    expect(evaluateClientQuota(capped, 3).allowed).toBe(false);
  });
});

describe("isSessionLengthAllowed", () => {
  it("enforces the per-session minute cap", () => {
    expect(isSessionLengthAllowed(freeTrial, 30)).toBe(true);
    expect(isSessionLengthAllowed(freeTrial, 31)).toBe(false);
    expect(isSessionLengthAllowed(pro, 90)).toBe(true);
  });
});

describe("hasFeature", () => {
  it("reads configured feature flags", () => {
    expect(hasFeature(pro, "clientPortal")).toBe(true);
    expect(hasFeature(pro, "whiteLabel")).toBe(false);
    expect(hasFeature(enterprise, "sso")).toBe(true);
  });
});

describe("isApproachingSessionLimit", () => {
  it("warns at/above the 80% threshold", () => {
    const p = parsePlan({
      id: "s",
      name: "starter",
      publicName: "Starter",
      limitsJson: { sessionsLimit: 10 },
      featuresJson: {},
    });
    expect(isApproachingSessionLimit(p, 7)).toBe(false);
    expect(isApproachingSessionLimit(p, 8)).toBe(true);
  });

  it("never warns for unlimited plans", () => {
    expect(isApproachingSessionLimit(enterprise, 10_000)).toBe(false);
  });
});
