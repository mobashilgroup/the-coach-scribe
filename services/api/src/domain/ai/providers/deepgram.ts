/**
 * Deepgram transcription adapter (Spec §14.6, §15).
 *
 * Live HTTP is implemented and guarded (TRANSCRIPTION_PROVIDER=deepgram +
 * DEEPGRAM_API_KEY). Deepgram fetches the audio from a URL we pass, so in
 * production `mediaRef` is a short-lived signed object-storage URL. `fetch` is
 * injectable so request shaping and diarization mapping are unit-tested without
 * a key or network. Local-disk dev uses the fake provider.
 */

import type { TranscribeParams, TranscriptionProvider, TranscriptionResult } from "./types.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DeepgramConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly name = "deepgram";
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(private readonly config: DeepgramConfig) {
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.baseUrl = config.baseUrl ?? "https://api.deepgram.com/v1";
  }

  async transcribe(params: TranscribeParams): Promise<TranscriptionResult> {
    if (!this.config.apiKey) throw new Error("DEEPGRAM_API_KEY is required for the deepgram provider");
    if (!/^https?:\/\//u.test(params.mediaRef)) {
      throw new Error("Deepgram requires an http(s) media URL (use a signed storage URL).");
    }
    const raw = await this.callDeepgram(params);
    return mapDeepgramApiResponse(raw);
  }

  /** Isolated network boundary. */
  protected async callDeepgram(params: TranscribeParams): Promise<DeepgramApiResponse> {
    const query = new URLSearchParams({
      model: this.config.model,
      diarize: "true",
      punctuate: "true",
      smart_format: "true",
    });
    if (params.languageHint) query.set("language", params.languageHint);
    else query.set("detect_language", "true");

    const res = await this.fetchImpl(`${this.baseUrl}/listen?${query.toString()}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Token ${this.config.apiKey}` },
      body: JSON.stringify({ url: params.mediaRef }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Deepgram request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as DeepgramApiResponse;
  }
}

// --- Deepgram response shape (subset we use) --------------------------------

interface DeepgramWordApi {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}
export interface DeepgramApiResponse {
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{ words?: DeepgramWordApi[] }>;
    }>;
  };
}

/** Map Deepgram's real response into our provider-neutral result. */
export function mapDeepgramApiResponse(raw: DeepgramApiResponse): TranscriptionResult {
  const channel = raw.results?.channels?.[0];
  const words = channel?.alternatives?.[0]?.words ?? [];
  return mapDeepgramWords(words, channel?.detected_language ?? "en");
}

/** Group diarized words into per-speaker segments. */
export function mapDeepgramWords(words: DeepgramWordApi[], language: string): TranscriptionResult {
  const segments: TranscriptionResult["segments"] = [];
  const speakerSet = new Set<string>();
  let current: (typeof segments)[number] | null = null;
  let currentSpeaker: number | undefined;

  for (const w of words) {
    const label = speakerLabel(w.speaker);
    speakerSet.add(label);
    const token = w.punctuated_word ?? w.word;
    if (!current || w.speaker !== currentSpeaker) {
      if (current) segments.push(current);
      current = { speakerLabel: label, startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000), text: token, confidence: w.confidence };
      currentSpeaker = w.speaker;
    } else {
      current.endMs = Math.round(w.end * 1000);
      current.text += ` ${token}`;
      current.confidence = Math.min(current.confidence, w.confidence);
    }
  }
  if (current) segments.push(current);
  return { languageDetected: language, segments, speakers: [...speakerSet] };
}

function speakerLabel(speaker: number | undefined): string {
  if (speaker === undefined) return "Speaker";
  return speaker === 0 ? "Coach" : speaker === 1 ? "Client" : `Speaker ${speaker + 1}`;
}
