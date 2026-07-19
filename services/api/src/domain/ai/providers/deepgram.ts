/**
 * Deepgram transcription adapter (Spec §14.6, §15).
 *
 * Thin adapter that maps our TranscribeParams to Deepgram's pre-recorded API
 * with diarization enabled, and maps the response back to TranscriptionResult.
 * The HTTP call is isolated to `callDeepgram` so it can be mocked; wiring the
 * live request is a follow-up once a real key is provisioned. Until then the
 * factory defaults to the fake provider (TRANSCRIPTION_PROVIDER=fake).
 */

import type {
  TranscribeParams,
  TranscriptionProvider,
  TranscriptionResult,
} from "./types.js";

export interface DeepgramConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly name = "deepgram";

  constructor(private readonly config: DeepgramConfig) {}

  async transcribe(params: TranscribeParams): Promise<TranscriptionResult> {
    if (!this.config.apiKey) {
      throw new Error("DEEPGRAM_API_KEY is required for the deepgram provider");
    }
    const raw = await this.callDeepgram(params);
    return mapDeepgramResponse(raw);
  }

  /** Isolated network boundary — replace with a real fetch when key is live. */
  protected async callDeepgram(_params: TranscribeParams): Promise<DeepgramResponse> {
    throw new Error(
      "Deepgram live request not yet wired. Set TRANSCRIPTION_PROVIDER=fake for now.",
    );
  }
}

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

export interface DeepgramResponse {
  detected_language?: string;
  words: DeepgramWord[];
}

/** Group Deepgram word-level diarization into per-speaker segments. */
export function mapDeepgramResponse(raw: DeepgramResponse): TranscriptionResult {
  const segments: TranscriptionResult["segments"] = [];
  const speakerSet = new Set<string>();
  let current: (typeof segments)[number] | null = null;
  let currentSpeaker: number | undefined;

  for (const w of raw.words) {
    const label = speakerLabel(w.speaker);
    speakerSet.add(label);
    if (!current || w.speaker !== currentSpeaker) {
      if (current) segments.push(current);
      current = {
        speakerLabel: label,
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
        text: w.word,
        confidence: w.confidence,
      };
      currentSpeaker = w.speaker;
    } else {
      current.endMs = Math.round(w.end * 1000);
      current.text += ` ${w.word}`;
      current.confidence = Math.min(current.confidence, w.confidence);
    }
  }
  if (current) segments.push(current);

  return {
    languageDetected: raw.detected_language ?? "en",
    segments,
    speakers: [...speakerSet],
  };
}

function speakerLabel(speaker: number | undefined): string {
  if (speaker === undefined) return "Speaker";
  return speaker === 0 ? "Coach" : speaker === 1 ? "Client" : `Speaker ${speaker + 1}`;
}
