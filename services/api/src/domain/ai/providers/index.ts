/**
 * Provider factory. Callers pass explicit config (derived from env at the edge)
 * so the domain layer stays free of process.env. Default selection is the fake
 * providers, which require no keys.
 */

import { FakeAnalysisProvider, FakeTranscriptionProvider } from "./fake.js";
import { DeepgramTranscriptionProvider } from "./deepgram.js";
import { AssemblyAITranscriptionProvider } from "./assemblyai.js";
import { OpenAIAnalysisProvider } from "./openai.js";
import type { AnalysisProvider, TranscriptionProvider } from "./types.js";

export interface ProviderConfig {
  transcription: "fake" | "deepgram" | "assemblyai";
  analysis: "fake" | "openai";
  deepgramApiKey?: string;
  deepgramModel?: string;
  assemblyaiApiKey?: string;
  assemblyaiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

export function createTranscriptionProvider(config: ProviderConfig): TranscriptionProvider {
  switch (config.transcription) {
    case "deepgram":
      return new DeepgramTranscriptionProvider({
        apiKey: config.deepgramApiKey ?? "",
        model: config.deepgramModel ?? "nova-2",
      });
    case "assemblyai":
      return new AssemblyAITranscriptionProvider({
        apiKey: config.assemblyaiApiKey ?? "",
        model: config.assemblyaiModel ?? "best",
      });
    case "fake":
    default:
      return new FakeTranscriptionProvider();
  }
}

export function createAnalysisProvider(config: ProviderConfig): AnalysisProvider {
  switch (config.analysis) {
    case "openai":
      return new OpenAIAnalysisProvider({
        apiKey: config.openaiApiKey ?? "",
        model: config.openaiModel ?? "gpt-4o",
      });
    case "fake":
    default:
      return new FakeAnalysisProvider();
  }
}

export * from "./types.js";
