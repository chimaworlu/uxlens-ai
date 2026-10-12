// Ported unchanged from lib/pipeline/analysis/schemas.ts — pure zod
// schemas, no Node-specific APIs. Keep identical to the Next.js app's copy.
import { z } from "npm:zod@4";

export const ObservationSchema = z.object({
  type: z.enum(["theme", "pain", "suggestion"]),
  statement: z.string().min(1),
  verbatim_quote: z.string().min(1),
  chunkId: z.string().min(1),
});
export const ObservationArraySchema = z.array(ObservationSchema);
export type Observation = z.infer<typeof ObservationSchema>;

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
    .max(10),
});
export type ClusteredInsight = z.infer<typeof ClusteredInsightSchema>;

export const ClusteredInsightsSchema = z.object({
  insights: z.array(ClusteredInsightSchema).min(1),
});
