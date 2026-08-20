import { completeText } from "../../ai/provider.ts";
import { estimateTokens } from "../../ai/tokens.ts";
import { parseJsonWithSchema } from "./json.ts";
import { ObservationArraySchema, type Observation } from "./schemas.ts";

// PRD Section 6, step 7: "max ~30k input tokens per call" — kept
// conservative here to leave headroom for the char/4 token estimate's
// margin of error.
const MAX_BATCH_INPUT_TOKENS = 25_000;
const PARALLEL_BATCHES = 4;
const MAX_OUTPUT_TOKENS = 4000;

const SYSTEM_PROMPT = `You are analyzing raw UX research documents (interview transcripts, survey responses, notes) to extract candidate observations. For every distinct theme, pain point, or suggestion mentioned in the provided chunks, output one JSON object with:
- "type": one of "theme", "pain", "suggestion"
- "statement": a short, specific description of the observation
- "verbatim_quote": an EXACT substring copied character-for-character from the source chunk supporting this observation — never paraphrase, never alter punctuation or spacing
- "chunkId": the id of the chunk the quote was copied from, exactly as given in the "[chunkId: ...]" marker

Respond with ONLY a JSON array of these objects, nothing else — no markdown, no commentary. If a chunk has no clear observations, contribute nothing from it.`;

type ChunkInput = { id: string; content: string };

function batchChunks(chunks: ChunkInput[]): ChunkInput[][] {
  const batches: ChunkInput[][] = [];
  let current: ChunkInput[] = [];
  let currentTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk.content);
    if (current.length > 0 && currentTokens + chunkTokens > MAX_BATCH_INPUT_TOKENS) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(chunk);
    currentTokens += chunkTokens;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function formatBatch(batch: ChunkInput[]): string {
  return batch.map((chunk) => `[chunkId: ${chunk.id}]\n${chunk.content}`).join("\n\n---\n\n");
}

async function runBatch(batch: ChunkInput[]): Promise<Observation[]> {
  const validIds = new Set(batch.map((chunk) => chunk.id));
  const user = formatBatch(batch);

  const raw = await completeText({
    system: SYSTEM_PROMPT,
    user,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    provider: "deepseek",
  });
  const attempt = parseJsonWithSchema(raw, ObservationArraySchema);
  if (attempt.success) return attempt.data.filter((o) => validIds.has(o.chunkId));

  // PRD Section 6, step 8's retry-once-with-validation-error pattern,
  // applied here too since Pass A also needs strict JSON.
  const retryUser = `${user}\n\nYour previous response failed validation with this error:\n${attempt.error}\n\nRespond again with ONLY a valid JSON array matching the required shape.`;
  const retryRaw = await completeText({
    system: SYSTEM_PROMPT,
    user: retryUser,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    provider: "deepseek",
  });
  const retryAttempt = parseJsonWithSchema(retryRaw, ObservationArraySchema);
  if (!retryAttempt.success) {
    throw new Error(`Pass A batch failed validation twice: ${retryAttempt.error}`);
  }
  return retryAttempt.data.filter((o) => validIds.has(o.chunkId));
}

export async function runPassA(chunks: ChunkInput[]): Promise<Observation[]> {
  const batches = batchChunks(chunks);
  const results: Observation[] = [];

  // Parallelized 4 batches at a time, per PRD Section 6 step 7.
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const group = batches.slice(i, i + PARALLEL_BATCHES);
    const groupResults = await Promise.all(group.map(runBatch));
    for (const observations of groupResults) results.push(...observations);
  }

  return results;
}
