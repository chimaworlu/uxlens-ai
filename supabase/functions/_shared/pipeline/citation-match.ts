// Ported unchanged from lib/pipeline/citation-match.ts — pure string/regex
// logic, no Node-specific APIs. Keep identical to the Next.js app's copy;
// if the matching algorithm ever changes there, mirror the change here too.
const FUZZY_MATCH_THRESHOLD = 0.9;

export function locateQuote(content: string, quote: string): { start: number; end: number } | null {
  const exactIdx = content.indexOf(quote);
  if (exactIdx !== -1) return { start: exactIdx, end: exactIdx + quote.length };

  const normalizedMatch = locateNormalized(content, quote);
  if (normalizedMatch) return normalizedMatch;

  return locateFuzzy(content, quote);
}

function locateNormalized(content: string, quote: string): { start: number; end: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const match = content.match(new RegExp(pattern, "i"));
  if (!match || match.index === undefined) return null;
  return { start: match.index, end: match.index + match[0].length };
}

function locateFuzzy(content: string, quote: string): { start: number; end: number } | null {
  const windowSize = quote.length;
  if (windowSize === 0 || windowSize > content.length) return null;

  const step = Math.max(1, Math.floor(windowSize / 8));
  let bestRatio = 0;
  let bestStart = -1;

  for (let start = 0; start <= content.length - windowSize; start += step) {
    const ratio = similarityRatio(content.slice(start, start + windowSize), quote);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestStart = start;
    }
  }

  if (bestRatio >= FUZZY_MATCH_THRESHOLD && bestStart !== -1) {
    return { start: bestStart, end: bestStart + windowSize };
  }
  return null;
}

function similarityRatio(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const cols = b.length + 1;
  const dist = new Array(cols);
  for (let j = 0; j < cols; j++) dist[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prevDiag = dist[0];
    dist[0] = i;
    for (let j = 1; j < cols; j++) {
      const temp = dist[j];
      dist[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dist[j], dist[j - 1]);
      prevDiag = temp;
    }
  }
  return dist[cols - 1];
}
