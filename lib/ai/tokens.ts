// Rough token estimate (~4 chars/token for English), used only for soft
// budgeting — chunk sizing, Pass A batch limits, and the FR-22b input
// ceiling — never for billing. The PRD itself only ever states these
// figures as approximate ("~800 token chunks", "~30k input tokens per
// call"), so a tokenizer dependency isn't worth the weight for a number
// that's a guardrail, not an exact count.
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// FR-22's 300-word floor is a word count, not a token estimate.
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}
