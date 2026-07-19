/**
 * Provider interfaces (Master Spec §14.6, §19.4).
 *
 * Transcription (Deepgram) and analysis (OpenAI) sit behind these interfaces so
 * they can be swapped — or faked in tests — without touching callers. No caller
 * ever imports a concrete provider; they receive one via the factory.
 */

export interface TranscriptSegmentInput {
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
}

export interface TranscriptionResult {
  languageDetected: string;
  segments: TranscriptSegmentInput[];
  /** Distinct speaker labels the diarizer produced. */
  speakers: string[];
}

export interface TranscribeParams {
  /** Storage key / URL of the media to transcribe. */
  mediaRef: string;
  languageHint?: string;
  /** Custom vocabulary (names, companies) to bias recognition (Spec §15.2). */
  vocabulary?: string[];
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(params: TranscribeParams): Promise<TranscriptionResult>;
}

export interface AnalyzeParams {
  transcriptText: string;
  outputLanguage: string;
  sessionType?: string;
  /** Whether the source is free-text coach notes vs a literal transcript (Spec §10.15). */
  sourceIsFreeText?: boolean;
  coachStyle?: string;
}

export interface AnalysisProvider {
  readonly name: string;
  /** Returns a JSON object intended to satisfy the summary schema. */
  analyze(params: AnalyzeParams): Promise<unknown>;
}
