// Model-written prose sometimes uses em/en dashes despite being told not
// to — this is the hard guarantee behind the prompt instruction, applied
// to every AI-generated string before it's persisted.
export function stripEmDash(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
}
