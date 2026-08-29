import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { DEEPSEEK_BASE_URL, DEEPSEEK_CHAT_MODEL } from "./config.ts";

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
    return;
  }

  const client = getDeepSeekClient();
  const stream = await client.chat.completions.create({
    model: DEEPSEEK_CHAT_MODEL,
    max_tokens: params.maxOutputTokens,
    stream: true,
    messages: [
      { role: "system", content: params.system },
      ...params.messages.map((turn) => ({ role: turn.role, content: turn.content }) as const),
    ],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
