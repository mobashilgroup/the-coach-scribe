import { describe, expect, it } from "vitest";
import { createAnalysisProvider, createTranscriptionProvider } from "./providers/index.js";
import { mapDeepgramWords } from "./providers/deepgram.js";
import { safeJsonParse } from "./providers/openai.js";
import { runAnalysis, runFullPipeline, transcriptToText } from "./pipeline.js";

const fakeConfig = { transcription: "fake" as const, analysis: "fake" as const };

describe("full pipeline with fake providers", () => {
  it("produces a validated summary end to end", async () => {
    const transcription = createTranscriptionProvider(fakeConfig);
    const analysis = createAnalysisProvider(fakeConfig);
    const { transcript, result } = await runFullPipeline(transcription, analysis, {
      mediaRef: "s3://bucket/session.m4a",
      outputLanguage: "en",
    });

    expect(transcript.speakers).toContain("Client");
    expect(result.summary.summary.length).toBeGreaterThan(0);
    expect(result.summary.action_items.length).toBeGreaterThan(0);
    expect(result.modelProvider).toBe("fake");
    expect(result.repaired).toBe(false);
  });

  it("flags free-text sources in uncertainties", async () => {
    const analysis = createAnalysisProvider(fakeConfig);
    const result = await runAnalysis(
      analysis,
      "Client seemed motivated and set two goals.",
      { outputLanguage: "en" },
      { sourceIsFreeText: true },
    );
    expect(result.summary.uncertainties.join(" ")).toMatch(/notes/i);
  });
});

describe("transcriptToText", () => {
  it("renders speaker-tagged, timestamped lines", () => {
    const text = transcriptToText({
      languageDetected: "en",
      speakers: ["Coach"],
      segments: [{ speakerLabel: "Coach", startMs: 65000, endMs: 70000, text: "Hello", confidence: 0.9 }],
    });
    expect(text).toBe("[01:05] Coach: Hello");
  });
});

describe("deepgram word mapping", () => {
  it("groups diarized words into per-speaker segments", () => {
    const result = mapDeepgramWords(
      [
        { word: "how", start: 0, end: 0.4, confidence: 0.99, speaker: 0 },
        { word: "are", start: 0.4, end: 0.7, confidence: 0.98, speaker: 0 },
        { word: "good", start: 1.0, end: 1.4, confidence: 0.8, speaker: 1 },
      ],
      "en",
    );
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.speakerLabel).toBe("Coach");
    expect(result.segments[0]!.text).toBe("how are");
    expect(result.segments[1]!.speakerLabel).toBe("Client");
    expect(result.speakers).toEqual(["Coach", "Client"]);
  });
});

describe("openai output parsing", () => {
  it("strips json code fences", () => {
    expect(safeJsonParse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(safeJsonParse('{"b":2}')).toEqual({ b: 2 });
  });
});
