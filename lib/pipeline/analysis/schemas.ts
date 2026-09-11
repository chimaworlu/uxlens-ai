import { z } from "zod";

// Pass A output shape (PRD Section 6, step 7). "type" here is the raw
// observation category, not yet the final InsightType — contradictions
// only emerge once Pass B clusters observations against each other.
export const ObservationSchema = z.object({
  type: z.enum(["theme", "pain", "suggestion"]),
  statement: z.string().min(1),
  verbatim_quote: z.string().min(1),
  chunkId: z.string().min(1),
});
export const ObservationArraySchema = z.array(ObservationSchema);
export type Observation = z.infer<typeof ObservationSchema>;

// Pass B output shape (step 8) — the final Insight categories.
export const InsightTypeSchema = z.enum(["THEME", "PAIN_POINT", "SUGGESTION", "CONTRADICTION"]);

export const ClusteredInsightSchema = z.object({
  type: InsightTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  citations: z
    .array(
      z.object({
        chunkId: z.string().min(1),
        quote: z.string().min(1),
      })
    )
    .min(1)
    .max(10), // FR-18: 1-10 citations per insight
});
export type ClusteredInsight = z.infer<typeof ClusteredInsightSchema>;

export const ClusteredInsightsSchema = z.object({
  insights: z.array(ClusteredInsightSchema).min(1),
});
