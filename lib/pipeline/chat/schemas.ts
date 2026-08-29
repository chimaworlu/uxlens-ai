import { z } from "zod";

// PRD Section 6, Stage 5, step 12b: 3-5 keyword variants of the user's
// question, used only on large projects that skip the "send everything"
// path.
export const KeywordVariantsSchema = z.object({
  variants: z.array(z.string().trim().min(1)).min(1).max(5),
});
