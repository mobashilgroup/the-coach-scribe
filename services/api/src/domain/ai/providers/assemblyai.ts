/**
 * AssemblyAI transcription adapter (Spec §14.6, §15) — alternative to Deepgram.
 *
 * AssemblyAI is asynchronous: submit the audio URL, then poll until the
 * transcript is `completed`. The adapter hides that behind the same
 * `TranscriptionProvider.transcribe()` contract. Like Deepgram it needs a
 * reachable audio URL, so production uses a short-lived signed storage URL.
 *
 * `fetch` is injectable so submit + poll + diarization mapping are unit-tested
 * without a key or network. Guarded: only used when
 * TRANSCRIPTION_PROVIDER=assemblyai and ASSEMBLYAI_API_KEY is set.
 */

import type { TranscribeParams, TranscriptionProvider, TranscriptionResult } from "./types.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface AssemblyAIConfig {
  apiKey: string;
  baseUrl?: string;
  /** Speech model, e.g. "best" | "nano". */
  model?: string;
  fetchImpl?: FetchLike;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export class AssemblyAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "assemblyai";
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;

  constructor(private readonly config: AssemblyAIConfig) {
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.baseUrl = config.baseUrl ?? "https://api.assemblyai.com/v2";
    this.pollIntervalMs = config.pollIntervalMs ?? 3000;
    this.maxPolls = config.maxPolls ?? 200;
  }

  async transcribe(params: TranscribeParams): Promise<TranscriptionResult> {
    if (!this.config.apiKey) throw new Error("ASSEMBLYAI_API_KEY is required for the assemblyai provider");
    if (!/^https?:\/\//u.test(params.mediaRef)) {
      throw new Error("AssemblyAI requires an http(s) media URL (use a signed storage URL).");
    }
    const id = await this.submit(params);
    const result = await this.poll(id);
    return mapAssemblyAiResponse(result);
  }

  /** Create a transcription job. */
  protected async submit(params: TranscribeParams): Promise<string> {
    const body: Record<string, unknown> = {
      audio_url: params.mediaRef,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    };
    if (this.config.model) body.speech_model = this.config.model;
    if (params.languageHint) body.language_code = params.languageHint;
    else body.language_detection = true;
    if (params.vocabulary?.length) body.word_boost = params.vocabulary;

    const res = await this.fetchImpl(`${this.baseUrl}/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: this.config.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AssemblyAI submit failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as AssemblyAiTranscript;
    if (!data.id) throw new Error("AssemblyAI submit returned no id");
    return data.id;
  }

  /** Poll until the job completes or errors. */
  protected async poll(id: string): Promise<AssemblyAiTranscript> {
    for (let attempt = 0; attempt < this.maxPolls; attempt++) {
      const res = await this.fetchImpl(`${this.baseUrl}/transcript/${id}`, {
        method: "GET",
        headers: { authorization: this.config.apiKey },
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`AssemblyAI poll failed (${res.status}): ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as AssemblyAiTranscript;
      if (data.status === "completed") return data;
      if (data.status === "error") throw new Error(`AssemblyAI transcription error: ${data.error ?? "unknown"}`);
      if (this.pollIntervalMs > 0) await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
    throw new Error("AssemblyAI transcription timed out");
  }
}

// --- AssemblyAI response shapes (subset) ------------------------------------

interface AssemblyAiWord {
  text: string;
  start: number; // ms
  end: number; // ms
  confidence: number;
  speaker?: string | null;
}
interface AssemblyAiUtterance {
  speaker: string; // "A", "B", ...
  text: string;
  start: number; // ms
  end: number; // ms
  confidence: number;
}
export interface AssemblyAiTranscript {
  id?: string;
  status?: "queued" | "processing" | "completed" | "error";
  error?: string;
  language_code?: string;
  utterances?: AssemblyAiUtterance[] | null;
  words?: AssemblyAiWord[] | null;
}

/** Map AssemblyAI's response to the provider-neutral result. */
export function mapAssemblyAiResponse(data: AssemblyAiTranscript): TranscriptionResult {
  const language = data.language_code ?? "en";
  const speakerSet = new Set<string>();

  // Prefer utterances (already speaker-grouped).
  if (data.utterances && data.utterances.length > 0) {
    const segments = data.utterances.map((u) => {
      const label = speakerLabel(u.speaker);
      speakerSet.add(label);
      return { speakerLabel: label, startMs: u.start, endMs: u.end, text: u.text, confidence: u.confidence };
    });
    return { languageDetected: language, segments, speakers: [...speakerSet] };
  }

  // Fallback: group words by speaker.
  const words = data.words ?? [];
  const segments: TranscriptionResult["segments"] = [];
  let current: (typeof segments)[number] | null = null;
  let currentSpeaker: string | null | undefined;
  for (const w of words) {
    const label = speakerLabel(w.speaker ?? undefined);
    speakerSet.add(label);
    if (!current || w.speaker !== currentSpeaker) {
      if (current) segments.push(current);
      current = { speakerLabel: label, startMs: w.start, endMs: w.end, text: w.text, confidence: w.confidence };
      currentSpeaker = w.speaker;
    } else {
      current.endMs = w.end;
      current.text += ` ${w.text}`;
      current.confidence = Math.min(current.confidence, w.confidence);
    }
  }
  if (current) segments.push(current);
  return { languageDetected: language, segments, speakers: [...speakerSet] };
}

/** AssemblyAI labels speakers "A", "B", …; map the first two to Coach/Client. */
function speakerLabel(speaker: string | undefined): string {
  if (!speaker) return "Speaker";
  if (speaker === "A") return "Coach";
  if (speaker === "B") return "Client";
  return `Speaker ${speaker}`;
}
