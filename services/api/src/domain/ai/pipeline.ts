/**
 * AI pipeline orchestration (Master Spec §8.3 steps 11–13, §14).
 *
 * Given a media reference or free text, produce a validated, structured summary
 * plus the transcript segments. Pure orchestration over the provider interfaces
 * and the schema validator — no database, no env. The API/worker layer persists
 * the result and moves the session through its states.
 */

import { parseOrRepairSummary, SUMMARY_SCHEMA_VERSION, type Summary } from "./schema.js";
import { SUMMARY_PROMPT_VERSION } from "./prompts.js";
import type {
  AnalysisProvider,
  TranscriptionProvider,
  TranscriptionResult,
} from "./providers/types.js";

export interface TranscribeInput {
  mediaRef: string;
  languageHint?: string;
  vocabulary?: string[];
}

export interface AnalyzeInput {
  outputLanguage: string;
  sessionType?: string;
  coachStyle?: string;
}

export interface SummaryResult {
  summary: Summary;
  schemaVersion: string;
  promptVersion: string;
  modelProvider: string;
  repaired: boolean;
  repairNotes: string[];
}

/** Flatten diarized segments into a readable, speaker-tagged transcript. */
export function transcriptToText(result: TranscriptionResult): string {
  return result.segments
    .map((s) => `[${formatMs(s.startMs)}] ${s.speakerLabel}: ${s.text}`)
    .join("\n");
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function runTranscription(
  provider: TranscriptionProvider,
  input: TranscribeInput,
): Promise<TranscriptionResult> {
  return provider.transcribe({
    mediaRef: input.mediaRef,
    languageHint: input.languageHint,
    vocabulary: input.vocabulary,
  });
}

/** Analyze transcript/notes text into a validated summary. */
export async function runAnalysis(
  provider: AnalysisProvider,
  transcriptText: string,
  input: AnalyzeInput,
  opts: { sourceIsFreeText?: boolean } = {},
): Promise<SummaryResult> {
  const raw = await provider.analyze({
    transcriptText,
    outputLanguage: input.outputLanguage,
    sessionType: input.sessionType,
    sourceIsFreeText: opts.sourceIsFreeText,
    coachStyle: input.coachStyle,
  });
  const { value, repaired, notes } = parseOrRepairSummary(raw);
  return {
    summary: value,
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    promptVersion: SUMMARY_PROMPT_VERSION,
    modelProvider: provider.name,
    repaired,
    repairNotes: notes,
  };
}

/** Full media path: transcribe then analyze. */
export async function runFullPipeline(
  transcription: TranscriptionProvider,
  analysis: AnalysisProvider,
  input: TranscribeInput & AnalyzeInput,
): Promise<{ transcript: TranscriptionResult; result: SummaryResult }> {
  const transcript = await runTranscription(transcription, input);
  const text = transcriptToText(transcript);
  const result = await runAnalysis(analysis, text, input, { sourceIsFreeText: false });
  return { transcript, result };
}
