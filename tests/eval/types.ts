export type InsightType = "THEME" | "PAIN_POINT" | "SUGGESTION" | "CONTRADICTION";

// `description` is judged for substance, not exact wording (R-10) — an LLM
// judge decides whether any produced insight captures the same finding,
// paraphrased or not, so this should read like a plain description of the
// finding a correct analysis ought to surface, not a title to string-match.
export type ExpectedInsight = {
  type: InsightType;
  description: string;
};

export type ChatCase = {
  question: string;
  // "refusal": the documents don't cover this, a correct answer says so.
  // "grounded": the documents do cover this, a correct answer cites them.
  expectation: "refusal" | "grounded";
};

export type GoldenCase = {
  id: string;
  documents: { filename: string; content: string }[];
  expectedInsights: ExpectedInsight[];
  chatCases: ChatCase[];
};

export type InsightScore = {
  expected: ExpectedInsight;
  matched: boolean;
  matchedTitle: string | null;
};

export type ChatScore = {
  question: string;
  expectation: ChatCase["expectation"];
  hasCitations: boolean;
  verdict: "correct_refusal" | "correct_grounded" | "fabrication" | "incorrect_refusal";
  reasoning: string;
};

export type CaseResult = {
  caseId: string;
  producedCount: number;
  verifiedCount: number;
  droppedCount: number;
  insightScores: InsightScore[];
  chatScores: ChatScore[];
  error?: string;
};

export type RunRecord = {
  date: string;
  gitCommit: string;
  config: { synthesisProvider: string; chatProvider: string };
  results: CaseResult[];
  insightHitRate: number;
  dropRate: number;
  fabrications: number;
};
