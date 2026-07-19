/**
 * OpenAI analysis adapter (Spec §14.6).
 *
 * Live HTTP is implemented and guarded: it only runs when ANALYSIS_PROVIDER=openai
 * and OPENAI_API_KEY is set. `fetch` is injectable so the request shaping and
 * response mapping are unit-tested without a real key or network. Until keys are
 * provisioned the factory defaults to the deterministic fake provider.
 */

import type { AnalysisProvider, AnalyzeParams, ReplyDraftParams } from "./types.js";
import { buildReplyPrompt, buildSummaryPrompt } from "../prompts.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class OpenAIAnalysisProvider implements AnalysisProvider {
  readonly name = "openai";
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(private readonly config: OpenAIConfig) {
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  async analyze(params: AnalyzeParams): Promise<unknown> {
    const prompt = buildSummaryPrompt(params);
    const text = await this.chat(prompt, { json: true });
    return safeJsonParse(text);
  }

  async draftReply(params: ReplyDraftParams): Promise<string> {
    return (await this.chat(buildReplyPrompt(params), { json: false })).trim();
  }

  /** Single Chat Completions call. Isolated for mockability. */
  protected async chat(prompt: { system: string; user: string }, opts: { json: boolean }): Promise<string> {
    if (!this.config.apiKey) throw new Error("OPENAI_API_KEY is required for the openai provider");
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.2,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as OpenAIChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("OpenAI response had no message content");
    return content;
  }
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Parse model output, tolerating ```json fences the model sometimes adds. */
export function safeJsonParse(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const body = fenced ? fenced[1]! : text;
  return JSON.parse(body.trim());
}
