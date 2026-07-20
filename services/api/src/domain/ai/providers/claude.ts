/**
 * Claude (Anthropic) analysis adapter (Spec §14.6) — alternative to OpenAI.
 *
 * Uses the official Anthropic SDK. Model defaults to claude-opus-4-8 with
 * adaptive thinking. The client is injectable so request shaping and response
 * mapping are unit-tested without a key or network. Guarded: only used when
 * ANALYSIS_PROVIDER=claude and ANTHROPIC_API_KEY is set.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisProvider, AnalyzeParams, ReplyDraftParams } from "./types.js";
import { buildReplyPrompt, buildSummaryPrompt } from "../prompts.js";
import { safeJsonParse } from "./openai.js";

/** Minimal shape we depend on — lets tests inject a stub without the network. */
export interface AnthropicLike {
  messages: {
    create(params: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
  client?: AnthropicLike;
}

export class ClaudeAnalysisProvider implements AnalysisProvider {
  readonly name = "claude";
  private readonly client: AnthropicLike;
  private readonly model: string;

  constructor(private readonly config: ClaudeConfig) {
    this.model = config.model ?? "claude-opus-4-8";
    this.client = config.client ?? (new Anthropic({ apiKey: config.apiKey }) as unknown as AnthropicLike);
  }

  async analyze(params: AnalyzeParams): Promise<unknown> {
    const prompt = buildSummaryPrompt(params);
    const text = await this.complete(prompt, { json: true });
    // The pipeline validates/repairs against the summary schema.
    return safeJsonParse(text);
  }

  async draftReply(params: ReplyDraftParams): Promise<string> {
    return (await this.complete(buildReplyPrompt(params), { json: false })).trim();
  }

  /** Single Messages API call. Isolated for mockability. */
  protected async complete(prompt: { system: string; user: string }, opts: { json: boolean }): Promise<string> {
    if (!this.config.apiKey && !this.config.client) {
      throw new Error("ANTHROPIC_API_KEY is required for the claude provider");
    }
    const system = opts.json
      ? `${prompt.system}\nReturn ONLY a single JSON object matching the schema, with no surrounding prose.`
      : prompt.system;
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: prompt.user }],
    });
    const text = (res.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
    if (!text) throw new Error("Claude response had no text content");
    return text;
  }
}
