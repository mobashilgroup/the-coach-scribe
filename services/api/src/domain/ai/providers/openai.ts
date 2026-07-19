/**
 * OpenAI analysis adapter (Spec §14.6).
 *
 * Builds the structured-summary prompt (from `prompts/summary_v1`) and asks the
 * model for JSON. The network call is isolated to `callOpenAI` for mockability;
 * the returned value is handed to the schema validator/repairer by the pipeline
 * — this adapter does not trust the model's JSON blindly.
 */

import type { AnalysisProvider, AnalyzeParams, ReplyDraftParams } from "./types.js";
import { buildReplyPrompt, buildSummaryPrompt } from "../prompts.js";

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAIAnalysisProvider implements AnalysisProvider {
  readonly name = "openai";

  constructor(private readonly config: OpenAIConfig) {}

  async analyze(params: AnalyzeParams): Promise<unknown> {
    if (!this.config.apiKey) {
      throw new Error("OPENAI_API_KEY is required for the openai provider");
    }
    const prompt = buildSummaryPrompt(params);
    const text = await this.callOpenAI(prompt);
    return safeJsonParse(text);
  }

  async draftReply(params: ReplyDraftParams): Promise<string> {
    if (!this.config.apiKey) throw new Error("OPENAI_API_KEY is required for the openai provider");
    return (await this.callOpenAI(buildReplyPrompt(params))).trim();
  }

  /** Isolated network boundary — replace with a real fetch when key is live. */
  protected async callOpenAI(_prompt: { system: string; user: string }): Promise<string> {
    throw new Error(
      "OpenAI live request not yet wired. Set ANALYSIS_PROVIDER=fake for now.",
    );
  }
}

/** Parse model output, tolerating ```json fences the model sometimes adds. */
export function safeJsonParse(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const body = fenced ? fenced[1]! : text;
  return JSON.parse(body.trim());
}
