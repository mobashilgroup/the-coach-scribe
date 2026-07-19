import { describe, expect, it } from "vitest";
import { parseOrRepairSummary, parseSummary, repairSummary, SummarySchema } from "./schema.js";

const wellFormed = {
  summary: "Client explored career transition.",
  topics: ["career", "confidence"],
  expressed_emotions: [{ label: "anxiety", evidence: "mentioned deadlines", confidence: 0.6 }],
  obstacles: ["fear of failure"],
  strengths: ["strong network"],
  goals: [{ title: "Update CV", description: "", target_date: null }],
  action_items: [
    { title: "Draft resume", owner: "client", due_date: null, source_timestamp: "00:18:30" },
  ],
  recommendations: ["Follow up in two weeks"],
  reflection_questions: ["What would success look like?"],
  key_quotes: [{ text: "I feel stuck", speaker: "client", timestamp: "00:10:12" }],
  uncertainties: [],
  safety_flags: [],
};

describe("SummarySchema", () => {
  it("accepts a well-formed payload", () => {
    expect(() => parseSummary(wellFormed)).not.toThrow();
  });

  it("fills defaults for a minimal payload", () => {
    const parsed = SummarySchema.parse({ summary: "short" });
    expect(parsed.topics).toEqual([]);
    expect(parsed.action_items).toEqual([]);
    expect(parsed.safety_flags).toEqual([]);
  });

  it("rejects an out-of-range confidence under strict parse", () => {
    const bad = { ...wellFormed, expressed_emotions: [{ label: "x", evidence: "", confidence: 5 }] };
    expect(() => parseSummary(bad)).toThrow();
  });

  it("rejects a malformed timestamp format", () => {
    const bad = {
      ...wellFormed,
      action_items: [{ title: "t", owner: "client", due_date: null, source_timestamp: "18m30s" }],
    };
    expect(() => parseSummary(bad)).toThrow();
  });
});

describe("repairSummary", () => {
  it("drops malformed array items instead of failing the whole payload", () => {
    const messy = {
      summary: "ok",
      topics: ["career", 42, null, "growth"],
      action_items: [
        { title: "keep me", owner: "client" },
        { owner: "client" }, // missing title → dropped
      ],
    };
    const result = repairSummary(messy);
    expect(result.ok).toBe(true);
    expect(result.value?.topics).toEqual(["career", "growth"]);
    expect(result.value?.action_items).toHaveLength(1);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("fails cleanly when the input is not an object", () => {
    expect(repairSummary("not json").ok).toBe(false);
    expect(repairSummary([1, 2, 3]).ok).toBe(false);
  });
});

describe("parseOrRepairSummary", () => {
  it("reports repaired:false for valid input", () => {
    const r = parseOrRepairSummary(wellFormed);
    expect(r.repaired).toBe(false);
  });

  it("repairs recoverable input and flags it", () => {
    const r = parseOrRepairSummary({ summary: "ok", topics: ["a", 1] });
    expect(r.repaired).toBe(true);
    expect(r.value.topics).toEqual(["a"]);
  });

  it("throws when the payload is unusable", () => {
    expect(() => parseOrRepairSummary(null)).toThrow();
  });
});
