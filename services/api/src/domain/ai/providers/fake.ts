/**
 * Deterministic fake providers.
 *
 * These let the entire pipeline — and its tests, and local development — run
 * with no API keys and no network. They are NOT random: given the same input
 * they produce the same output, so tests are stable.
 */

import type {
  AnalysisProvider,
  AnalyzeParams,
  ReplyDraftParams,
  TranscribeParams,
  TranscriptionProvider,
  TranscriptionResult,
} from "./types.js";

export class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly name = "fake";

  async transcribe(params: TranscribeParams): Promise<TranscriptionResult> {
    const language = params.languageHint ?? "en";
    return {
      languageDetected: language,
      speakers: ["Coach", "Client"],
      segments: [
        { speakerLabel: "Coach", startMs: 0, endMs: 4000, text: "How have things been since we last spoke?", confidence: 0.95 },
        { speakerLabel: "Client", startMs: 4000, endMs: 12000, text: "Honestly a bit overwhelmed with the new role, but hopeful.", confidence: 0.92 },
        { speakerLabel: "Coach", startMs: 12000, endMs: 16000, text: "What would make this week feel like a win?", confidence: 0.94 },
        { speakerLabel: "Client", startMs: 16000, endMs: 24000, text: "Finishing the handover doc and asking my manager for feedback.", confidence: 0.9 },
      ],
    };
  }
}

export class FakeAnalysisProvider implements AnalysisProvider {
  readonly name = "fake";

  async analyze(params: AnalyzeParams): Promise<unknown> {
    // Deterministic structured output that satisfies the summary schema.
    return {
      summary:
        "The client is adjusting to a new role. They feel overwhelmed but hopeful, " +
        "and identified concrete next steps around a handover document and seeking feedback.",
      topics: ["role transition", "workload", "feedback"],
      expressed_emotions: [
        { label: "overwhelm", evidence: "a bit overwhelmed with the new role", confidence: 0.7 },
        { label: "hope", evidence: "but hopeful", confidence: 0.6 },
      ],
      obstacles: ["Adjusting to increased responsibility"],
      strengths: ["Self-awareness", "Willingness to seek feedback"],
      goals: [{ title: "Settle into the new role", description: "Build confidence over the coming weeks", target_date: null }],
      action_items: [
        { title: "Finish the handover document", owner: "client", due_date: null, source_timestamp: "00:16" },
        { title: "Ask manager for feedback", owner: "client", due_date: null, source_timestamp: "00:20" },
      ],
      recommendations: ["Revisit workload boundaries next session"],
      reflection_questions: ["What support would make this transition easier?"],
      key_quotes: [{ text: "overwhelmed with the new role, but hopeful", speaker: "client", timestamp: "00:04" }],
      uncertainties: params.sourceIsFreeText ? ["Source was coach notes, not a verbatim transcript"] : [],
      safety_flags: [],
    };
  }

  async draftReply(params: ReplyDraftParams): Promise<string> {
    const opener = params.urgent
      ? "Thank you for flagging this — I've seen your note."
      : "Thanks for your message.";
    return (
      `${opener} Based on our recent work together, it sounds like you're making real progress. ` +
      `Let's pick this up and keep the momentum going. I'll follow up with next steps before our next session. ` +
      `— (Draft for coach review)`
    );
  }
}
