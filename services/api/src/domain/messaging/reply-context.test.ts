import { describe, expect, it } from "vitest";
import { buildReplyContext, isClientLinkedToCoach } from "./reply-context.js";

const mk = (summary: string, extra: Record<string, unknown>, day: number) => ({
  content: { summary, ...extra },
  createdAt: new Date(`2026-07-${String(day).padStart(2, "0")}T00:00:00Z`),
});

describe("buildReplyContext", () => {
  it("includes only summary/topics/goals/actions, never sensitive fields", () => {
    const ctx = buildReplyContext([
      mk("Explored career change.", {
        topics: ["career"],
        goals: [{ title: "Update CV" }],
        action_items: [{ title: "Draft resume" }],
        // Sensitive fields that must NOT appear:
        key_quotes: [{ text: "I feel worthless", speaker: "client" }],
        expressed_emotions: [{ label: "despair", evidence: "secret detail", confidence: 0.9 }],
        transcript: "full private transcript",
      }, 10),
    ]);
    expect(ctx).toMatch(/Explored career change/);
    expect(ctx).toMatch(/career/);
    expect(ctx).toMatch(/Update CV/);
    expect(ctx).toMatch(/Draft resume/);
    // Redaction:
    expect(ctx).not.toMatch(/worthless/);
    expect(ctx).not.toMatch(/despair/);
    expect(ctx).not.toMatch(/secret detail/);
    expect(ctx).not.toMatch(/private transcript/);
  });

  it("uses at most the 3 most recent sessions", () => {
    const summaries = [1, 2, 3, 4, 5].map((d) => mk(`S${d}`, { topics: [] }, d));
    const ctx = buildReplyContext(summaries);
    expect(ctx).toMatch(/S5/);
    expect(ctx).toMatch(/S4/);
    expect(ctx).toMatch(/S3/);
    expect(ctx).not.toMatch(/S2/);
    expect(ctx).not.toMatch(/\bS1\b/);
  });
});

describe("isClientLinkedToCoach", () => {
  it("allows the primary coach", () => {
    expect(isClientLinkedToCoach(null, "coach1", "coach1")).toBe(true);
  });
  it("allows an active secondary link", () => {
    expect(isClientLinkedToCoach({ status: "active" }, "coach1", "coach2")).toBe(true);
  });
  it("blocks an unlinked coach", () => {
    expect(isClientLinkedToCoach(null, "coach1", "coach2")).toBe(false);
    expect(isClientLinkedToCoach({ status: "revoked" }, "coach1", "coach2")).toBe(false);
  });
});
