import { describe, expect, it } from "vitest";
import {
  AssemblyAITranscriptionProvider,
  mapAssemblyAiResponse,
  type FetchLike,
} from "./assemblyai.js";

function json(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

/** Scripts a sequence of responses and records requests. */
function scriptedFetch(responses: unknown[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return json(responses[Math.min(i++, responses.length - 1)]);
  };
  return { fetchImpl, calls };
}

describe("AssemblyAITranscriptionProvider", () => {
  it("submits the audio URL with diarization, polls until completed, and maps utterances", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { id: "t1", status: "queued" }, // submit
      { id: "t1", status: "processing" }, // first poll
      {
        id: "t1",
        status: "completed",
        language_code: "en",
        utterances: [
          { speaker: "A", text: "How are you?", start: 0, end: 1500, confidence: 0.95 },
          { speaker: "B", text: "Good, thanks.", start: 1600, end: 3000, confidence: 0.9 },
        ],
      },
    ]);
    const provider = new AssemblyAITranscriptionProvider({ apiKey: "aai-key", fetchImpl, pollIntervalMs: 0 });
    const result = await provider.transcribe({ mediaRef: "https://storage.example/a.m4a" });

    expect(result.speakers).toEqual(["Coach", "Client"]);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.speakerLabel).toBe("Coach");
    expect(result.segments[0]!.text).toBe("How are you?");

    // Submit request shape.
    const submit = calls[0]!;
    expect(submit.url).toMatch(/\/transcript$/);
    expect(submit.init.headers).toMatchObject({ authorization: "aai-key" });
    const body = JSON.parse(submit.init.body as string);
    expect(body.audio_url).toBe("https://storage.example/a.m4a");
    expect(body.speaker_labels).toBe(true);
    // Poll uses the returned id.
    expect(calls[1]!.url).toMatch(/\/transcript\/t1$/);
  });

  it("throws on an error status", async () => {
    const { fetchImpl } = scriptedFetch([
      { id: "t1", status: "queued" },
      { id: "t1", status: "error", error: "bad audio" },
    ]);
    const provider = new AssemblyAITranscriptionProvider({ apiKey: "k", fetchImpl, pollIntervalMs: 0 });
    await expect(provider.transcribe({ mediaRef: "https://x/a.m4a" })).rejects.toThrow(/bad audio/);
  });

  it("requires an http(s) media URL", async () => {
    const provider = new AssemblyAITranscriptionProvider({ apiKey: "k", fetchImpl: async () => json({}) });
    await expect(provider.transcribe({ mediaRef: "local:key" })).rejects.toThrow(/media URL/);
  });
});

describe("mapAssemblyAiResponse", () => {
  it("falls back to grouping words when there are no utterances", () => {
    const r = mapAssemblyAiResponse({
      language_code: "es",
      words: [
        { text: "hola", start: 0, end: 400, confidence: 0.9, speaker: "A" },
        { text: "coach", start: 400, end: 800, confidence: 0.8, speaker: "A" },
        { text: "sí", start: 900, end: 1200, confidence: 0.7, speaker: "B" },
      ],
    });
    expect(r.languageDetected).toBe("es");
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0]!.text).toBe("hola coach");
    expect(r.segments[1]!.speakerLabel).toBe("Client");
  });

  it("tolerates an empty response", () => {
    const r = mapAssemblyAiResponse({});
    expect(r.segments).toEqual([]);
    expect(r.speakers).toEqual([]);
  });
});
