// Ported from lib/pipeline/analysis/passA.ts for the Deno Edge Function
// runtime. Only the single-batch call (the old file's internal runBatch)
// is ported: batching chunks into groups now happens once, up front, in
// lib/queue/analysis.ts (Next.js side) when it dispatches one pgmq message
// per batch — this function just runs the one batch its message carries.
// Keep the prompt and retry behavior identical to the Next.js copy; if
// either changes there, mirror the change here too.
import { completeText } from "../../ai/provider.ts";
import { parseJsonWithSchema } from "./json.ts";
import { ObservationArraySchema, type Observation } from "./schemas.ts";

const MAX_OUTPUT_TOKENS = 4000;

const SYSTEM_PROMPT = `You are analyzing raw UX research documents (interview transcripts, survey responses, notes) to extract candidate observations. For every distinct theme, pain point, or suggestion mentioned in the provided chunks, output one JSON object with:
- "type": one of "theme", "pain", "suggestion"
- "statement": a short, specific description of the observation
- "verbatim_quote": an EXACT substring copied character-for-character from the source chunk supporting this observation — never paraphrase, never alter punctuation or spacing
- "chunkId": the id of the chunk the quote was copied from, exactly as given in the "[chunkId: ...]" marker

Respond with ONLY a JSON array of these objects, nothing else — no markdown, no commentary. If a chunk has no clear observations, contribute nothing from it.`;

type ChunkInput = { id: string; content: string };

function formatBatch(batch: ChunkInput[]): string {
  return batch.map((chunk) => `[chunkId: ${chunk.id}]\n${chunk.content}`).join("\n\n---\n\n");
}

export async function runObservationBatch(
  batch: ChunkInput[],
  onCost?: (usd: number) => void
): Promise<Observation[]> {
  const validIds = new Set(batch.map((chunk) => chunk.id));
  const user = formatBatch(batch);

  const raw = await completeText({
    system: SYSTEM_PROMPT,
    user,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    provider: "deepseek",
    onCost,
  });
  const attempt = parseJsonWithSchema(raw, ObservationArraySchema);
  if (attempt.success) return attempt.data.filter((o) => validIds.has(o.chunkId));

  const retryUser = `${user}\n\nYour previous response failed validation with this error:\n${attempt.error}\n\nRespond again with ONLY a valid JSON array matching the required shape.`;
  const retryRaw = await completeText({
    system: SYSTEM_PROMPT,
    user: retryUser,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    provider: "deepseek",
    onCost,
  });
  const retryAttempt = parseJsonWithSchema(retryRaw, ObservationArraySchema);
  if (!retryAttempt.success) {
    throw new Error(`Pass A batch failed validation twice: ${retryAttempt.error}`);
  }
  return retryAttempt.data.filter((o) => validIds.has(o.chunkId));
}
