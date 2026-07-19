/**
 * Structured AI summary schema (Master Spec §14.3).
 *
 * The analysis provider must return JSON that validates against this schema.
 * If it doesn't, we attempt a bounded, deterministic repair (coerce/trim/drop
 * malformed items) before giving up — Spec §14.4 "Devolver JSON que cumpla el
 * esquema. Si falla, reintentar con reparación controlada."
 *
 * The schema is versioned (`SUMMARY_SCHEMA_VERSION`) so stored summaries can be
 * migrated safely.
 */

import { z } from "zod";

export const SUMMARY_SCHEMA_VERSION = "1";

const timestamp = z
  .string()
  .regex(/^\d{1,2}:\d{2}(:\d{2})?$/u, "expected mm:ss or hh:mm:ss")
  .nullable()
  .optional();

export const ExpressedEmotion = z.object({
  label: z.string().min(1),
  evidence: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
});

export const GoalItem = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  target_date: z.string().nullable().default(null),
});

export const ActionItem = z.object({
  title: z.string().min(1),
  owner: z.enum(["coach", "client"]).default("client"),
  due_date: z.string().nullable().default(null),
  source_timestamp: timestamp,
});

export const KeyQuote = z.object({
  text: z.string().min(1),
  speaker: z.string().default("client"),
  timestamp: timestamp,
});

export const SummarySchema = z.object({
  summary: z.string().default(""),
  topics: z.array(z.string()).default([]),
  expressed_emotions: z.array(ExpressedEmotion).default([]),
  obstacles: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  goals: z.array(GoalItem).default([]),
  action_items: z.array(ActionItem).default([]),
  recommendations: z.array(z.string()).default([]),
  reflection_questions: z.array(z.string()).default([]),
  key_quotes: z.array(KeyQuote).default([]),
  uncertainties: z.array(z.string()).default([]),
  safety_flags: z.array(z.string()).default([]),
});

export type Summary = z.infer<typeof SummarySchema>;

/** Strict parse: throws if the input does not conform. */
export function parseSummary(input: unknown): Summary {
  return SummarySchema.parse(input);
}

export interface RepairResult {
  ok: boolean;
  value?: Summary;
  /** Human-readable notes on what was coerced/dropped, for observability. */
  notes: string[];
}

/**
 * Bounded, deterministic repair. Drops malformed array items rather than
 * failing the whole payload, coerces obviously-fixable scalars, and fills
 * missing fields with schema defaults. Returns ok:false only when the input is
 * not even an object.
 */
export function repairSummary(input: unknown): RepairResult {
  const notes: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, notes: ["input is not a JSON object"] };
  }
  const raw = input as Record<string, unknown>;

  const cleanStringArray = (v: unknown, field: string): string[] => {
    if (!Array.isArray(v)) {
      if (v !== undefined) notes.push(`${field}: expected array, ignored`);
      return [];
    }
    const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (out.length !== v.length) notes.push(`${field}: dropped ${v.length - out.length} non-string item(s)`);
    return out;
  };

  const cleanObjectArray = <T>(v: unknown, field: string, item: z.ZodType<T>): T[] => {
    if (!Array.isArray(v)) {
      if (v !== undefined) notes.push(`${field}: expected array, ignored`);
      return [];
    }
    const out: T[] = [];
    for (const el of v) {
      const parsed = item.safeParse(el);
      if (parsed.success) out.push(parsed.data);
      else notes.push(`${field}: dropped 1 malformed item`);
    }
    return out;
  };

  const candidate = {
    summary: typeof raw.summary === "string" ? raw.summary : "",
    topics: cleanStringArray(raw.topics, "topics"),
    expressed_emotions: cleanObjectArray(raw.expressed_emotions, "expressed_emotions", ExpressedEmotion),
    obstacles: cleanStringArray(raw.obstacles, "obstacles"),
    strengths: cleanStringArray(raw.strengths, "strengths"),
    goals: cleanObjectArray(raw.goals, "goals", GoalItem),
    action_items: cleanObjectArray(raw.action_items, "action_items", ActionItem),
    recommendations: cleanStringArray(raw.recommendations, "recommendations"),
    reflection_questions: cleanStringArray(raw.reflection_questions, "reflection_questions"),
    key_quotes: cleanObjectArray(raw.key_quotes, "key_quotes", KeyQuote),
    uncertainties: cleanStringArray(raw.uncertainties, "uncertainties"),
    safety_flags: cleanStringArray(raw.safety_flags, "safety_flags"),
  };

  const parsed = SummarySchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, notes: [...notes, "repair failed final validation"] };
  }
  return { ok: true, value: parsed.data, notes };
}

/** Parse if valid, else repair. Throws only if the input is unusable. */
export function parseOrRepairSummary(input: unknown): { value: Summary; repaired: boolean; notes: string[] } {
  const strict = SummarySchema.safeParse(input);
  if (strict.success) return { value: strict.data, repaired: false, notes: [] };
  const repaired = repairSummary(input);
  if (!repaired.ok || !repaired.value) {
    throw new Error(`AI summary could not be validated or repaired: ${repaired.notes.join("; ")}`);
  }
  return { value: repaired.value, repaired: true, notes: repaired.notes };
}
