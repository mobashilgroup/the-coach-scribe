import { describe, expect, it } from "vitest";
import { canStartRecording, isConsentValid } from "./consent.js";

const now = new Date("2026-07-19T12:00:00Z");
const policy = { currentTextVersion: "v2", maxAgeDays: 180 };

describe("consent gating", () => {
  it("blocks when there is no consent", () => {
    expect(canStartRecording(null, policy, now)).toBe(false);
  });

  it("blocks when accepted but later revoked", () => {
    expect(
      isConsentValid(
        { acceptedAt: new Date("2026-07-01T00:00:00Z"), revokedAt: now, consentTextVersion: "v2" },
        policy,
        now,
      ),
    ).toBe(false);
  });

  it("blocks when the accepted text version is outdated", () => {
    expect(
      isConsentValid(
        { acceptedAt: new Date("2026-07-01T00:00:00Z"), revokedAt: null, consentTextVersion: "v1" },
        policy,
        now,
      ),
    ).toBe(false);
  });

  it("blocks a stale carried-over consent past maxAgeDays", () => {
    expect(
      isConsentValid(
        { acceptedAt: new Date("2025-01-01T00:00:00Z"), revokedAt: null, consentTextVersion: "v2" },
        policy,
        now,
      ),
    ).toBe(false);
  });

  it("allows a fresh, current, un-revoked consent", () => {
    expect(
      canStartRecording(
        { acceptedAt: new Date("2026-07-10T00:00:00Z"), revokedAt: null, consentTextVersion: "v2" },
        policy,
        now,
      ),
    ).toBe(true);
  });

  it("ignores age when no maxAgeDays is set", () => {
    expect(
      isConsentValid(
        { acceptedAt: new Date("2020-01-01T00:00:00Z"), revokedAt: null, consentTextVersion: "v2" },
        { currentTextVersion: "v2" },
        now,
      ),
    ).toBe(true);
  });
});
