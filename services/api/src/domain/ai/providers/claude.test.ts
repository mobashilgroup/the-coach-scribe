import { describe, expect, it } from "vitest";
import { ClaudeAnalysisProvider, type AnthropicLike } from "./claude.js";

/** A stub Anthropic client that records the request and returns canned content. */
function stub(text: string) {
  const calls: unknown[] = [];
  const client: AnthropicLike = {
    messages: {
      create: async (params: unknown) => {
        calls.push(params);
        return { content: [{ type: "text", text }] };
      },
    },
  };
  return { client, calls };
}

describe("ClaudeAnalysisProvider", () => {
  it("uses claude-opus-4-8 + adaptive thinking and parses JSON analysis", async () => {
    const { client, calls } = stub('{"summary":"ok","topics":["a"]}');
    const provider = new ClaudeAnalysisProvider({ apiKey: "sk-ant", client });
    const out = (await provider.analyze({ transcriptText: "hi", outputLanguage: "en" })) as { summary: string };

    expect(out.summary).toBe("ok");
    const req = calls[0] as { model: string; thinking: { type: string }; system: string; max_tokens: number };
    expect(req.model).toBe("claude-opus-4-8");
    expect(req.thinking).toEqual({ type: "adaptive" });
    expect(req.max_tokens).toBeGreaterThan(0);
    expect(req.system).toMatch(/JSON object/i);
  });

  it("honors a configured model override", async () => {
    const { client, calls } = stub('{"summary":"x"}');
    const provider = new ClaudeAnalysisProvider({ apiKey: "sk-ant", model: "claude-sonnet-5", client });
    await provider.analyze({ transcriptText: "hi", outputLanguage: "en" });
    expect((calls[0] as { model: string }).model).toBe("claude-sonnet-5");
  });

  it("drafts a plain-text reply (no JSON instruction)", async () => {
    const { client, calls } = stub("  Take care.  ");
    const provider = new ClaudeAnalysisProvider({ apiKey: "sk-ant", client });
    const reply = await provider.draftReply({ clientMessage: "hi", context: "", outputLanguage: "en", urgent: false });
    expect(reply).toBe("Take care.");
    expect((calls[0] as { system: string }).system).not.toMatch(/JSON object/i);
  });

  it("throws when the response has no text content", async () => {
    const client: AnthropicLike = { messages: { create: async () => ({ content: [] }) } };
    const provider = new ClaudeAnalysisProvider({ apiKey: "sk-ant", client });
    await expect(provider.analyze({ transcriptText: "x", outputLanguage: "en" })).rejects.toThrow(/no text content/);
  });
});
