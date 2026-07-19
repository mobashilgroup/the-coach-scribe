import { describe, expect, it } from "vitest";
import { audioDeleteAt, isDue, transcriptExpiresAt } from "./retention.js";

const config = { audioDeleteAfterHours: 24, transcriptRetentionDays: 90 };
const processedAt = new Date("2026-07-19T12:00:00Z");

describe("retention scheduling", () => {
  it("schedules audio deletion after the configured hours", () => {
    expect(audioDeleteAt(config, processedAt).toISOString()).toBe("2026-07-20T12:00:00.000Z");
  });

  it("schedules transcript expiry after the configured days", () => {
    expect(transcriptExpiresAt(config, processedAt).toISOString()).toBe("2026-10-17T12:00:00.000Z");
  });

  it("honours a 30-day retention configuration", () => {
    const c = { ...config, transcriptRetentionDays: 30 };
    expect(transcriptExpiresAt(c, processedAt).toISOString()).toBe("2026-08-18T12:00:00.000Z");
  });

  it("reports due deletions", () => {
    const now = new Date("2026-07-21T00:00:00Z");
    expect(isDue(audioDeleteAt(config, processedAt), now)).toBe(true);
    expect(isDue(transcriptExpiresAt(config, processedAt), now)).toBe(false);
    expect(isDue(null, now)).toBe(false);
  });
});
