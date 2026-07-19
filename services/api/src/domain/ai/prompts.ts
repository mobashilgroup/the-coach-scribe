/**
 * Prompt construction (Master Spec §14.4). Versioned so changes are auditable.
 *
 * The rules here encode the spec's guardrails: do not invent, separate facts
 * from inferences and uncertainties, cite timestamps, warm & non-clinical tone,
 * no diagnosis, express emotions as "expressed / appeared to" with confidence,
 * and produce output in the coach's chosen language regardless of the spoken
 * language.
 */

import type { AnalyzeParams } from "./providers/types.js";

export const SUMMARY_PROMPT_VERSION = "summary_v1";

const SYSTEM_RULES = `You are an administrative and analysis assistant for professional coaches.
You transform a coaching conversation into a structured, editable summary.
Hard rules:
- Do NOT invent information that is not present in the input.
- Separate facts from inferences and uncertainties; put anything unsure in "uncertainties".
- Cite timestamps (mm:ss) when available.
- Use professional, warm, non-clinical language. Do NOT diagnose.
- Never present a detected emotion as certainty; phrase as "expressed" / "appeared to" and give a confidence 0..1.
- Keep names and personal data only as given.
- Return ONLY a single JSON object matching the required schema. No prose outside JSON.`;

export function buildSummaryPrompt(params: AnalyzeParams): { system: string; user: string } {
  const sourceNote = params.sourceIsFreeText
    ? "The source is the coach's own notes, not a verbatim transcript. Do not treat phrasing as literal quotes."
    : "The source is a transcript of the session.";
  const style = params.coachStyle ? `Coach style preference: ${params.coachStyle}.` : "";

  const user = [
    `Output language: ${params.outputLanguage}. Produce ALL summary content in this language, even if the conversation was in another language.`,
    params.sessionType ? `Session type: ${params.sessionType}.` : "",
    sourceNote,
    style,
    "",
    "Conversation:",
    params.transcriptText,
  ]
    .filter(Boolean)
    .join("\n");

  return { system: SYSTEM_RULES, user };
}
