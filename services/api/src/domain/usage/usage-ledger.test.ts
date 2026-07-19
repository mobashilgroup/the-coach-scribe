import { describe, expect, it } from "vitest";
import {
  chargeSessionEntry,
  periodKey,
  refundSessionEntry,
  sessionsUsedInPeriod,
  type UsageEntry,
} from "./usage-ledger.js";

const jan = new Date("2026-01-15T10:00:00Z");
const feb = new Date("2026-02-02T10:00:00Z");

describe("periodKey", () => {
  it("formats month windows as UTC YYYY-MM", () => {
    expect(periodKey("month", jan)).toBe("2026-01");
    expect(periodKey("month", feb)).toBe("2026-02");
  });

  it("collapses total windows to a constant", () => {
    expect(periodKey("total", jan)).toBe("total");
    expect(periodKey("total", feb)).toBe("total");
  });
});

describe("sessionsUsedInPeriod", () => {
  it("sums charges in the matching period only", () => {
    const entries: UsageEntry[] = [
      chargeSessionEntry("month", jan, "s1"),
      chargeSessionEntry("month", jan, "s2"),
      chargeSessionEntry("month", feb, "s3"),
    ];
    expect(sessionsUsedInPeriod(entries, "2026-01")).toBe(2);
    expect(sessionsUsedInPeriod(entries, "2026-02")).toBe(1);
  });

  it("nets refunds for system-failed jobs against charges", () => {
    const entries: UsageEntry[] = [
      chargeSessionEntry("month", jan, "s1"),
      chargeSessionEntry("month", jan, "s2"),
      refundSessionEntry("month", jan, "s2"),
    ];
    expect(sessionsUsedInPeriod(entries, "2026-01")).toBe(1);
  });

  it("never returns negative usage", () => {
    const entries: UsageEntry[] = [refundSessionEntry("month", jan, "s1")];
    expect(sessionsUsedInPeriod(entries, "2026-01")).toBe(0);
  });
});
