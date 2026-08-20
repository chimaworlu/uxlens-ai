import { completeText, synthesisProvider } from "../../ai/provider.ts";
import { parseJsonWithSchema } from "./json.ts";
import { stripEmDash } from "./text.ts";
import { ClusteredInsightsSchema, type ClusteredInsight, type Observation } from "./schemas.ts";

const MAX_OUTPUT_TOKENS = 8000;

const SYSTEM_PROMPT = `You are synthesizing UX research findings from a list of candidate observations extracted from raw research documents. Cluster related observations into a final set of insights:
- 3 to 10 "THEME" insights: major recurring themes across the research.
- "PAIN_POINT" insights: specific pain points, ordered by how many distinct chunks/documents mention them (most frequent first).
- "SUGGESTION" insights: concrete suggestions or feature requests raised by participants.
- "CONTRADICTION" insights: cases where two or more observations express opposing opinions about the SAME specific topic.

STEP 1 — before anything else, group every observation by its specific topic (what it's actually about, not its "type" field) and check each group for disagreement. If a group contains both a negative/critical observation and a positive/neutral one about that same specific thing, that whole group becomes ONE "CONTRADICTION" insight citing every quote in the group, both critical and positive — it must NOT also appear as a separate PAIN_POINT or THEME, and none of its quotes may be dropped.

Worked example — given these observations:
[{"type":"pain","statement":"Search results are slow","verbatim_quote":"search takes forever to load","chunkId":"c1"},{"type":"pain","statement":"Search is actually fast for me","verbatim_quote":"search felt instant, no complaints","chunkId":"c2"}]
the correct output includes exactly this insight (not two separate pain points, not one pain point with the second quote dropped):
{"type":"CONTRADICTION","title":"Search speed: mixed experiences","description":"Some users found search slow while others found it instant, suggesting an inconsistent or environment-dependent experience.","citations":[{"chunkId":"c1","quote":"search takes forever to load"},{"chunkId":"c2","quote":"search felt instant, no complaints"}]}

STEP 2 — only after contradictions are pulled out, cluster whatever observations remain into THEME, PAIN_POINT, and SUGGESTION insights as normal.

For each insight, write a clear title and a 1-3 sentence description, and attach 1 to 10 supporting citations. Each citation MUST reuse an EXACT verbatim_quote and chunkId taken from the observations provided — never invent, paraphrase, or alter a quote. Never use em-dashes (—) or en-dashes (–) in any title or description; use commas, parentheses, or separate sentences instead.

Respond with ONLY a JSON object of this shape, nothing else — no markdown, no commentary:
{ "insights": [ { "type": "THEME"|"PAIN_POINT"|"SUGGESTION"|"CONTRADICTION", "title": string, "description": string, "citations": [{ "chunkId": string, "quote": string }] } ] }`;

function parseClustered(raw: string) {
  return parseJsonWithSchema(raw, ClusteredInsightsSchema);
}

export async function runPassB(observations: Observation[]): Promise<ClusteredInsight[]> {
  const provider = synthesisProvider();
  const user = JSON.stringify(observations);

  const first = await completeText({ system: SYSTEM_PROMPT, user, maxOutputTokens: MAX_OUTPUT_TOKENS, provider });
  const firstAttempt = parseClustered(first);
  if (firstAttempt.success) return firstAttempt.data.insights.map(sanitizeInsight);

  // PRD Section 6, step 8: invalid JSON is retried once with the
  // validation error appended, then the job fails cleanly.
  const retryUser = `${user}\n\nYour previous response failed validation with this error:\n${firstAttempt.error}\n\nRespond again with ONLY valid JSON matching the required shape.`;
  const retry = await completeText({
    system: SYSTEM_PROMPT,
    user: retryUser,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    provider,
  });
  const retryAttempt = parseClustered(retry);
  if (!retryAttempt.success) {
    throw new Error(`Pass B failed validation twice: ${retryAttempt.error}`);
  }
  return retryAttempt.data.insights.map(sanitizeInsight);
}

function sanitizeInsight(insight: ClusteredInsight): ClusteredInsight {
  return { ...insight, title: stripEmDash(insight.title), description: stripEmDash(insight.description) };
}
