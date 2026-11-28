/**
 * Extracts a total chapter, issue, or episode count from a user-pasted
 * number, range ("#1-12"), or web/Google AI Overview prose snippet.
 */
export function extractCountFromPastedText(
  rawText: string,
  unitKind: 'chapters' | 'issues' | 'episodes' = 'chapters'
): number | null {
  const trimmed = rawText.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  const parseIntSafe = (digits: string): number | null => {
    const n = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 1 || n > 10000) return null;
    return Math.round(n);
  };

  // 1. Bare integer input: "1199" or "1,199"
  if (/^\d[\d,]*$/.test(trimmed)) {
    return parseIntSafe(trimmed);
  }

  // 2. Priority released/published count phrases, avoiding scheduled/upcoming chapters
  // e.g. "There are 1,199 released chapters of the One Piece manga, with Chapter 1200 scheduled..."
  const unitNoun =
    unitKind === 'episodes'
      ? 'episodes?'
      : unitKind === 'issues'
        ? 'issues?'
        : '(?:released\\s+)?chapters?';

  const explicitReleasedRe = new RegExp(
    `(?:there are|total of|consists of|contains|collects|has|with|spanning|running)\\s+(\\d[\\d,]*)\\s+(?:released|published|aired|collected|total|full|main)?\\s*${unitNoun}(?!\\s*(?:is|are)?\\s*(?:scheduled|upcoming|releasing|due|slated))`,
    'i'
  );
  const mExplicit = trimmed.match(explicitReleasedRe);
  if (mExplicit) {
    const parsed = parseIntSafe(mExplicit[1]);
    if (parsed !== null) return parsed;
  }

  // 3. Direct "<N> [released/total] chapters/issues/episodes" not followed by scheduled/upcoming
  const directCountRe = new RegExp(
    `(\\d[\\d,]*)\\s+(?:released|published|aired|collected|total)?\\s*${unitKind === 'episodes' ? 'episodes?' : unitKind === 'issues' ? 'issues?' : 'chapters?'}\\b`,
    'gi'
  );
  for (const match of trimmed.matchAll(directCountRe)) {
    const idx = match.index ?? 0;
    const after = trimmed.slice(idx + match[0].length, idx + match[0].length + 45);
    if (/^\s*(?:is|are)?\s*(?:scheduled|upcoming|expected|due|releasing|planned)/i.test(after)) {
      continue;
    }
    const parsed = parseIntSafe(match[1]);
    if (parsed !== null) return parsed;
  }

  // 4. Collects range notation, e.g. "#1-34" or "#1–12"
  const rangeMatch = trimmed.match(/#\s*(\d+)\s*[-–—]\s*(\d+)/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 1 && end >= start && end - start < 2000) {
      return end - start + 1;
    }
  }

  // 5. Fallback "Chapter 1199" / "Issue #34" / "Episode 1122" (ignoring scheduled ones first)
  const labelRe = new RegExp(
    `\\b(?:${unitKind === 'episodes' ? 'episode|ep\\.?' : unitKind === 'issues' ? 'issue' : 'chapter|ch\\.?'})\\s*#?(\\d[\\d,]*)\\b`,
    'gi'
  );
  for (const match of trimmed.matchAll(labelRe)) {
    const idx = match.index ?? 0;
    const after = trimmed.slice(idx + match[0].length, idx + match[0].length + 45);
    if (/^\s*(?:is|will be|is scheduled|scheduled|upcoming|due|releasing)/i.test(after)) {
      continue;
    }
    const parsed = parseIntSafe(match[1]);
    if (parsed !== null) return parsed;
  }

  // 6. Last resort: any integer 1..10000
  const anyNum = trimmed.match(/\b(\d[\d,]{0,5})\b/);
  if (anyNum) {
    return parseIntSafe(anyNum[1]);
  }

  return null;
}
