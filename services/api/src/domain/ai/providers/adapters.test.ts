import { describe, expect, it } from "vitest";
import { OpenAIAnalysisProvider, type FetchLike } from "./openai.js";
import { DeepgramTranscriptionProvider, mapDeepgramApiResponse } from "./deepgram.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

/** A typed fetch stub that records the last request. */
function recorder(body: unknown, ok = true, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(body, ok, status);
  };
  return { fetchImpl, calls };
}

describe("OpenAIAnalysisProvider (live adapter, stubbed fetch)", () => {
  it("sends a JSON-mode chat request for analysis and parses the content", async () => {
    const { fetchImpl, calls } = recorder({ choices: [{ message: { content: '{"summary":"ok","topics":["a"]}' } }] });
    const provider = new OpenAIAnalysisProvider({ apiKey: "sk-test", model: "gpt-4o", fetchImpl });
    const out = (await provider.analyze({ transcriptText: "hi", outputLanguage: "en" })) as { summary: string };

    expect(out.summary).toBe("ok");
    const call = calls[0]!;
    expect(call.url).toMatch(/\/chat\/completions$/);
    const parsed = JSON.parse(call.init.body as string);
    expect(parsed.model).toBe("gpt-4o");
    expect(parsed.response_format).toEqual({ type: "json_object" });
    expect(call.init.headers).toMatchObject({ authorization: "Bearer sk-test" });
  });

  it("drafts a plain-text reply (no json mode)", async () => {
    const { fetchImpl, calls } = recorder({ choices: [{ message: { content: "  Take care.  " } }] });
    const provider = new OpenAIAnalysisProvider({ apiKey: "sk-test", model: "gpt-4o", fetchImpl });
    const reply = await provider.draftReply({ clientMessage: "hi", context: "", outputLanguage: "en", urgent: false });
    expect(reply).toBe("Take care.");
    expect(JSON.parse(calls[0]!.init.body as string).response_format).toBeUndefined();
  });

  it("throws a helpful error on non-2xx", async () => {
    const { fetchImpl } = recorder({ error: "bad" }, false, 401);
    const provider = new OpenAIAnalysisProvider({ apiKey: "sk-test", model: "gpt-4o", fetchImpl });
    await expect(provider.analyze({ transcriptText: "x", outputLanguage: "en" })).rejects.toThrow(/OpenAI request failed \(401\)/);
  });
});

describe("DeepgramTranscriptionProvider (live adapter, stubbed fetch)", () => {
  it("posts the media URL with diarization enabled and maps the response", async () => {
    const { fetchImpl, calls } = recorder({
      results: {
        channels: [
          {
            detected_language: "en",
            alternatives: [
              {
                words: [
                  { word: "hello", start: 0, end: 0.5, confidence: 0.9, speaker: 0 },
                  { word: "hi", start: 0.6, end: 0.9, confidence: 0.8, speaker: 1 },
                ],
              },
            ],
          },
        ],
      },
    });
    const provider = new DeepgramTranscriptionProvider({ apiKey: "dg-test", model: "nova-2", fetchImpl });
    const result = await provider.transcribe({ mediaRef: "https://storage.example/audio.m4a" });

    expect(result.speakers).toEqual(["Coach", "Client"]);
    expect(result.segments).toHaveLength(2);
    const call = calls[0]!;
    expect(call.url).toMatch(/diarize=true/);
    expect(call.init.headers).toMatchObject({ authorization: "Token dg-test" });
    expect(JSON.parse(call.init.body as string)).toEqual({ url: "https://storage.example/audio.m4a" });
  });

  it("refuses a non-URL media reference (needs a signed URL)", async () => {
    const { fetchImpl } = recorder({});
    const provider = new DeepgramTranscriptionProvider({ apiKey: "dg-test", model: "nova-2", fetchImpl });
    await expect(provider.transcribe({ mediaRef: "session:local-key" })).rejects.toThrow(/media URL/);
  });
});

describe("mapDeepgramApiResponse", () => {
  it("tolerates an empty response", () => {
    const r = mapDeepgramApiResponse({});
    expect(r.segments).toEqual([]);
    expect(r.speakers).toEqual([]);
  });
});
