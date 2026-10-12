// Ported unchanged from lib/pipeline/analysis/text.ts — pure logic, no
// Node-specific APIs.
export function stripEmDash(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
}
