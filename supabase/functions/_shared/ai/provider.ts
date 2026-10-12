// Ported from lib/ai/provider.ts for the Deno Edge Function runtime.
// Confirmed working via the Phase 4 validation spike
// (supabase/functions/analysis-spike, since deleted): both `openai` and
// `@anthropic-ai/sdk` import and call cleanly via npm: specifiers, with no
// load-time crash of the kind the pdf-parse/DOMMatrix bug caused in Phase 0
// (Anthropic's SDK has no such browser-API dependency, so a static
// top-level import is safe here, unlike extract.ts's pdf-parse import).
// Only completeText is ported, not streamText: the analysis pipeline never
// streams, that's chat-only and chat stays on the Next.js app for now.
import OpenAI from "npm:openai@7";
import Anthropic from "npm:@anthropic-ai/sdk@0.118";
import { DEEPSEEK_BASE_URL, DEEPSEEK_CHAT_MODEL } from "./config.ts";
import { computeCostUsd } from "./cost.ts";

export type AiProvider = "deepseek" | "claude";

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

let deepseekClient: OpenAI | undefined;
function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) throw new ProviderError("DEEPSEEK_API_KEY is not configured.");
    deepseekClient = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
  }
  return deepseekClient;
}

let claudeClient: Anthropic | undefined;
function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new ProviderError("ANTHROPIC_API_KEY is not configured.");
    claudeClient = new Anthropic({ apiKey });
  }
  return claudeClient;
}

// PRD Section 6: Pass B/D synthesis defaults to DeepSeek, Claude is an
// optional config-toggled upgrade. Pass A (map) always uses DeepSeek
// regardless of this setting.
export function synthesisProvider(): AiProvider {
  return Deno.env.get("AI_SYNTHESIS_PROVIDER") === "claude" ? "claude" : "deepseek";
}

export type CompletionParams = {
  system: string;
  user: string;
  maxOutputTokens: number;
  provider: AiProvider;
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
