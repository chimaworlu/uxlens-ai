// Ported unchanged from lib/pipeline/analysis/json.ts — pure logic, no
// Node-specific APIs.
export function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? raw).trim();
}

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

export function parseJsonWithSchema<T>(
  raw: string,
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: { message: string } } }
): ParseResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(raw));
  } catch (error) {
    return { success: false, error: `Invalid JSON: ${(error as Error).message}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success || result.data === undefined) {
    return { success: false, error: result.error?.message ?? "Schema validation failed." };
  }
  return { success: true, data: result.data };
}
