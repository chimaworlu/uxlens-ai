import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { DEEPSEEK_BASE_URL, DEEPSEEK_CHAT_MODEL } from "./config.ts";
import { computeCostUsd } from "./cost.ts";

// .agent/rules/security.md: every provider key is server-only, loaded from
// env vars, never reachable from client code. This module is the one place
// DeepSeek/Claude calls originate from, per the PRD's provider interface
// requirement.

export type AiProvider = "deepseek" | "claude";

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

// Lazily constructed, same reasoning as the R2 client and email
// transporter: building at import time would crash the whole process if
// the key is unset, instead of just failing the one call that needed it.
let deepseekClient: OpenAI | undefined;
function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new ProviderError("DEEPSEEK_API_KEY is not configured.");
    deepseekClient = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
  }
  return deepseekClient;
}

let claudeClient: Anthropic | undefined;
function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ProviderError("ANTHROPIC_API_KEY is not configured.");
    claudeClient = new Anthropic({ apiKey });
  }
  return claudeClient;
}

// PRD Section 6: Pass B/D synthesis defaults to DeepSeek, Claude is an
// optional config-toggled upgrade. Pass A (map) always uses DeepSeek
// regardless of this setting — callers just don't pass "claude" for it.
export function synthesisProvider(): AiProvider {
  return process.env.AI_SYNTHESIS_PROVIDER === "claude" ? "claude" : "deepseek";
}

export type CompletionParams = {
  system: string;
  user: string;
  maxOutputTokens: number;
  provider: AiProvider;
  // R-3's AI spend ceiling needs a running total across every call in a
  // pipeline run or chat turn (Pass A alone makes several). An optional
  // callback rather than changing this function's return type keeps every
  // existing caller that doesn't care about cost unchanged — callers that
  // do (run.ts, the chat route) pass a shared accumulator down through
  // their pass/retrieval functions instead of each one having to thread a
  // cost value through its own return type.
  onCost?: (usd: number) => void;
};

export async function completeText(params: CompletionParams): Promise<string> {
  if (params.provider === "claude") {
    const client = getClaudeClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: params.maxOutputTokens,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
    });
    params.onCost?.(computeCostUsd("claude", response.usage.input_tokens, response.usage.output_tokens));
    const block = response.content.find((entry) => entry.type === "text");
    if (!block || block.type !== "text") {
      throw new ProviderError("Claude returned no text content.");
    }
    return block.text;
  }

  const client = getDeepSeekClient();
  const response = await client.chat.completions.create({
    model: DEEPSEEK_CHAT_MODEL,
    max_tokens: params.maxOutputTokens,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });
  params.onCost?.(
    computeCostUsd("deepseek", response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0)
  );
  const content = response.choices[0]?.message?.content;
  if (!content) throw new ProviderError("DeepSeek returned no content.");
  return content;
}

// Chat (FR-27): the one caller that needs tokens as they arrive rather than
// the full response at once. A separate function rather than a `stream`
// flag on completeText — every existing completeText caller (Pass A/B/D)
// wants a single parsed string, so branching this in would just push a
// stream-vs-not conditional onto all of them for no benefit.
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type StreamParams = {
  system: string;
  messages: ChatTurn[];
  maxOutputTokens: number;
  provider: AiProvider;
  // Same accumulator pattern as CompletionParams.onCost — called once,
  // after the stream is fully drained, once final usage is known.
  onCost?: (usd: number) => void;
};

export async function* streamText(params: StreamParams): AsyncGenerator<string> {
  if (params.provider === "claude") {
    const client = getClaudeClient();
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: params.maxOutputTokens,
      system: params.system,
      messages: params.messages.map((turn) => ({ role: turn.role, content: turn.content })),
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    // Resolves once the stream above has fully ended (it's the same
    // underlying stream), with the complete message's final usage totals.
    const final = await stream.finalMessage();
    params.onCost?.(computeCostUsd("claude", final.usage.input_tokens, final.usage.output_tokens));
    return;
  }

  const client = getDeepSeekClient();
  const stream = await client.chat.completions.create({
    model: DEEPSEEK_CHAT_MODEL,
    max_tokens: params.maxOutputTokens,
    stream: true,
    // Without this, streamed chunks never carry a `usage` field at all —
    // OpenAI-compatible APIs only attach it to one final, content-less
    // chunk when explicitly asked for via stream_options.
    stream_options: { include_usage: true },
    messages: [
      { role: "system", content: params.system },
      ...params.messages.map((turn) => ({ role: turn.role, content: turn.content }) as const),
    ],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
    if (chunk.usage) {
      params.onCost?.(computeCostUsd("deepseek", chunk.usage.prompt_tokens, chunk.usage.completion_tokens));
    }
  }
}
