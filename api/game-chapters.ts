type ChapterUnit = 'chapters' | 'acts' | 'missions' | 'milestones';

export interface GameChapterSuggestPayload {
  found: boolean;
  unit: ChapterUnit;
  source?: 'catalog' | 'fandom' | 'wikipedia' | 'web';
  sourceLabel?: string;
  note?: string;
  chapters: string[];
}

const KNOWN_GAME_CHAPTERS: Record<
  string,
  { totalChapters: number; unit: ChapterUnit; note?: string }
> = {
  'onimusha way of the sword': {
    totalChapters: 23,
    unit: 'chapters',
    note: '23 main story chapters',
  },
  'onimusha 3 demon siege': { totalChapters: 11, unit: 'chapters' },
  'onimusha dawn of dreams': { totalChapters: 17, unit: 'chapters', note: '17 story stages' },
  'resident evil 4': { totalChapters: 16, unit: 'chapters', note: '16 remake chapters' },
  'resident evil 4 remake': { totalChapters: 16, unit: 'chapters', note: '16 main chapters' },
  'resident evil 5': { totalChapters: 16, unit: 'chapters' },
  'resident evil 6': { totalChapters: 20, unit: 'chapters' },
  'resident evil requiem': { totalChapters: 16, unit: 'chapters' },
  'final fantasy vii remake': { totalChapters: 18, unit: 'chapters', note: '18 chapters' },
  'final fantasy 7 remake': { totalChapters: 18, unit: 'chapters', note: '18 chapters' },
  'final fantasy vii rebirth': { totalChapters: 14, unit: 'chapters', note: '14 chapters' },
  'final fantasy 7 rebirth': { totalChapters: 14, unit: 'chapters', note: '14 chapters' },
  'final fantasy xvi': { totalChapters: 16, unit: 'chapters' },
  'alan wake 2': { totalChapters: 19, unit: 'chapters', note: '10 Return + 9 Initiation chapters' },
  'alan wake ii': { totalChapters: 19, unit: 'chapters' },
  'devil may cry 5': { totalChapters: 20, unit: 'missions', note: '20 missions' },
  'uncharted 4 a thiefs end': { totalChapters: 22, unit: 'chapters', note: '22 chapters' },
  'uncharted 4': { totalChapters: 22, unit: 'chapters', note: '22 chapters' },
  'uncharted 2 among thieves': { totalChapters: 26, unit: 'chapters' },
  'uncharted 3 drakes deception': { totalChapters: 22, unit: 'chapters' },
  'the last of us': { totalChapters: 12, unit: 'chapters', note: '12 story chapters' },
  'the last of us part i': { totalChapters: 12, unit: 'chapters', note: '12 story chapters' },
  'the last of us part ii': { totalChapters: 11, unit: 'chapters', note: '11 major story chapters' },
  'dead space': { totalChapters: 12, unit: 'chapters', note: '12 chapters' },
  'dead space 2': { totalChapters: 15, unit: 'chapters' },
  'black myth wukong': { totalChapters: 6, unit: 'chapters', note: '6 major chapters' },
  'god of war ragnarok': { totalChapters: 18, unit: 'chapters', note: '18 Path quests' },
  'baldurs gate 3': { totalChapters: 3, unit: 'acts', note: '3 major story acts' },
  'baldurs gate iii': { totalChapters: 3, unit: 'acts', note: '3 major story acts' },
  'clair obscur expedition 33': { totalChapters: 3, unit: 'acts', note: 'Prologue & 3 acts' },
  'lies of p': { totalChapters: 11, unit: 'chapters', note: '11 chapters' },
  'stellar blade': { totalChapters: 11, unit: 'chapters' },
  'doom the dark ages': { totalChapters: 22, unit: 'chapters', note: '22 campaign chapters' },
  'doom eternal': { totalChapters: 13, unit: 'missions', note: '13 campaign missions' },
  'silent hill 2': { totalChapters: 8, unit: 'chapters' },
  'death stranding': { totalChapters: 15, unit: 'chapters', note: '15 story episodes' },
  'death stranding 2': { totalChapters: 16, unit: 'chapters' },
  'death stranding 2 on the beach': { totalChapters: 16, unit: 'chapters' },
  'cyberpunk 2077': { totalChapters: 3, unit: 'acts', note: 'Prologue + 3 acts' },
  'ghost of tsushima': { totalChapters: 3, unit: 'acts', note: '3 story acts' },
  'ghost of yotei': { totalChapters: 3, unit: 'acts' },
  'red dead redemption 2': { totalChapters: 8, unit: 'chapters', note: '6 chapters + 2 epilogue parts' },
  'yakuza like a dragon': { totalChapters: 15, unit: 'chapters' },
  'like a dragon infinite wealth': { totalChapters: 14, unit: 'chapters' },
  'yakuza 0': { totalChapters: 17, unit: 'chapters' },
  'persona 5 royal': { totalChapters: 9, unit: 'chapters', note: '9 Palaces / arcs' },
  'metaphor refantazio': { totalChapters: 6, unit: 'acts', note: '6 major story months' },
  'the witcher 3 wild hunt': { totalChapters: 3, unit: 'acts', note: 'Prologue + 3 acts' },
  'it takes two': { totalChapters: 7, unit: 'chapters', note: '7 main chapters' },
  'split fiction': { totalChapters: 8, unit: 'chapters', note: '8 story chapters' },
  'mafia the old country': { totalChapters: 15, unit: 'chapters' },
  bayonetta: { totalChapters: 17, unit: 'chapters', note: '17 total chapters' },
  'a plague tale innocence': { totalChapters: 17, unit: 'chapters' },
  'a plague tale requiem': { totalChapters: 17, unit: 'chapters' },
  'xenoblade chronicles 3': { totalChapters: 7, unit: 'chapters' },
  celeste: { totalChapters: 9, unit: 'chapters' },
  'life is strange': { totalChapters: 5, unit: 'chapters', note: '5 episodes' },
  'hi fi rush': { totalChapters: 12, unit: 'missions', note: '12 tracks' },
};

function normalizeGameTitleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(remastered|remake|definitive edition|complete edition|goty|game of the year)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupKnownGameChapters(title: string) {
  const norm = normalizeGameTitleKey(title);
  if (!norm) return null;

  const rawWithRemake = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const exact = KNOWN_GAME_CHAPTERS[rawWithRemake] || KNOWN_GAME_CHAPTERS[norm];
  const candidate =
    exact ||
    Object.entries(KNOWN_GAME_CHAPTERS).find(([k]) => {
      const checkSuffix = (str: string) =>
        str.startsWith(`${k} `) &&
        !/^(?:\d+|ii|iii|iv|v|vi|x|part|rebirth)\b/i.test(str.slice(k.length + 1));
      return checkSuffix(rawWithRemake) || checkSuffix(norm);
    })?.[1];

  if (!candidate) return null;
  return {
    totalChapters: candidate.totalChapters,
    unit: candidate.unit,
    source: 'catalog' as const,
    note: candidate.note,
  };
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  'twenty-one': 21,
  'twenty-two': 22,
  'twenty-three': 23,
  'twenty-four': 24,
  'twenty-five': 25,
  thirty: 30,
};

function normalizeChapterUnit(raw: string): ChapterUnit {
  const lower = raw.toLowerCase();
  if (lower.startsWith('act')) return 'acts';
  if (lower.startsWith('mission') || lower.startsWith('stage') || lower.startsWith('level')) {
    return 'missions';
  }
  return 'chapters';
}

function parseChapterCountFromText(
  text: string
): { totalChapters: number; unit: ChapterUnit } | null {
  if (!text) return null;

  const counts = new Map<string, number>();
  const recordHit = (num: number, rawUnit: string, weight: number) => {
    if (!Number.isFinite(num) || num < 2 || num > 80) return;
    const unit = normalizeChapterUnit(rawUnit);
    const key = `${num}:${unit}`;
    counts.set(key, (counts.get(key) || 0) + weight);
  };

  const digitRegex =
    /(?:\b(?:are|has|have|with|features?|includes?|contains?|consists?\s+of|divided\s+into|split\s+into|spanning|total\s+of|all)\s+)?\b(\d{1,2})\s+(?:main\s+|story\s+|campaign\s+|playable\s+|total\s+|separate\s+|unique\s+)?(chapters|acts|missions)\b/gi;
  for (const m of text.matchAll(digitRegex)) {
    const val = Number(m[1]);
    const weight = m[0].trim().length > m[1].length + m[2].length + 2 ? 4 : 2;
    recordHit(val, m[2], weight);
  }

  const wordKeys = Object.keys(NUMBER_WORDS).join('|');
  const wordRegex = new RegExp(
    `\\b(${wordKeys})\\s+(?:main\\s+|story\\s+|campaign\\s+)?(chapters|acts|missions)\\b`,
    'gi'
  );
  for (const m of text.matchAll(wordRegex)) {
    const val = NUMBER_WORDS[m[1].toLowerCase()];
    if (val) recordHit(val, m[2], 3);
  }

  const chapterHeadings = [...text.matchAll(/\b(?:chapter|mission|act)\s+(\d{1,2})\b/gi)]
    .map((m) => ({ val: Number(m[1]), unit: normalizeChapterUnit(m[0]) }))
    .filter((x) => x.val >= 1 && x.val <= 60);
  const distinctHeadings = new Set(chapterHeadings.map((h) => h.val));
  if (distinctHeadings.size >= 3) {
    const maxHeading = chapterHeadings.reduce((best, cur) => (cur.val > best.val ? cur : best));
    if (maxHeading.val >= 3) {
      recordHit(maxHeading.val, maxHeading.unit, 2);
    }
  }

  if (counts.size === 0) return null;

  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return Number(b[0].split(':')[0]) - Number(a[0].split(':')[0]);
  });

  const [bestKey] = sorted[0];
  const [numStr, unitStr] = bestKey.split(':');
  return {
    totalChapters: Number(numStr),
    unit: unitStr as ChapterUnit,
  };
}

function jsonResponse(body: unknown, status = 200, maxAge = 86400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control':
        status === 200
          ? `public, s-maxage=${maxAge}, stale-while-revalidate=604800`
          : 'no-store',
    },
  });
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchWikipediaChapters(title: string) {
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        `${title} video game`
      )}&format=json&srlimit=3`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      query?: { search?: Array<{ pageid: number; title: string }> };
    };
    const hits = searchJson.query?.search || [];
    if (hits.length === 0) return null;

    const pageId = hits[0].pageid;
    const extractRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=${pageId}&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!extractRes.ok) return null;
    const extractJson = (await extractRes.json()) as {
      query?: { pages?: Record<string, { extract?: string; title?: string }> };
    };
    const page = extractJson.query?.pages?.[String(pageId)];
    const extract = page?.extract || '';
    const parsed = parseChapterCountFromText(extract);
    if (!parsed) return null;

    return {
      found: true as const,
      totalChapters: parsed.totalChapters,
      unit: parsed.unit,
      source: 'wikipedia' as const,
      note: `Detected from Wikipedia (${page?.title || hits[0].title})`,
    };
  } catch {
    return null;
  }
}

async function searchWebSnippetChapters(title: string) {
  try {
    const query = `"${title}" how many chapters`;
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const snippets: string[] = [];
    for (const match of html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)) {
      snippets.push(stripTags(match[1]));
    }
    const combined = snippets.join(' · ') || stripTags(html).slice(0, 12000);
    const parsed = parseChapterCountFromText(combined);
    if (!parsed) return null;
    return {
      found: true as const,
      totalChapters: parsed.totalChapters,
      unit: parsed.unit,
      source: 'web' as const,
      note: 'Auto-detected from web game guides',
    };
  } catch {
    return null;
  }
}

function cleanGameTitleForSearch(rawTitle: string): { cleanTitle: string; wantsDlc: boolean } {
  const wantsDlc = /\b(complete|definitive|goty|game of the year|ultimate|royal)\b/i.test(rawTitle);
  const cleanTitle = rawTitle
    .replace(/\([^)]*\)/g, ' ')
    .replace(
      /\s*[-–—:]\s*(the\s+)?(complete|definitive|goty|game of the year|remastered|director'?s cut|royal|ultimate|anniversary|gold|deluxe|standard)\s*(edition|version|cut)?$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
  return { cleanTitle: cleanTitle || rawTitle.trim(), wantsDlc };
}

function cleanWikiItemText(raw: string): string {
  return raw
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    .replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,3}/g, '')
    .replace(/^[-*•+]+\s*/, '')
    .replace(/^\d{1,3}[.):\-]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFandomMissionListFromWikitext(
  wikitext: string,
  wantsDlc: boolean
): { chapters: string[]; detectedUnit: ChapterUnit } {
  const lines = wikitext.replace(/\r/g, '').split('\n');
  const chapters: string[] = [];
  const seen = new Set<string>();
  let missionHits = 0;
  let chapterHits = 0;
  let actHits = 0;

  let skipSection = false;
  let inDlcSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Detect MediaWiki section headings or bold table headings
    const headingMatch =
      trimmed.match(/^={2,5}\s*([^=]+?)\s*={2,5}$/) ||
      trimmed.match(/^\|\s*colspan=["']?\d+["']?\s*\|\s*(.+)$/i);
    if (headingMatch) {
      const h = cleanWikiItemText(headingMatch[1]).toLowerCase();
      if (/\b(?:alphabetical|sub missions|side quests|side missions|twilight|trivia|collectibles|navigation|references|gallery)\b/.test(h)) {
        skipSection = true;
        continue;
      }
      if (/\bdlc\b/.test(h)) {
        inDlcSection = true;
        skipSection = !wantsDlc;
        continue;
      }
      if (/\b(?:main missions|story missions|campaign missions|chapters|episodes|walkthrough|acts)\b/.test(h)) {
        skipSection = false;
        inDlcSection = false;
        if (/\bmissions?\b/.test(h)) missionHits += 3;
        if (/\bacts?\b/.test(h)) actHits += 3;
        if (/\bchapters?\b/.test(h)) chapterHits += 3;
      }
      continue;
    }

    if (skipSection) continue;
    if (inDlcSection && !wantsDlc) continue;

    // Bullet item `* [[Title]]` or numbered `# [[Title]]`
    const listMatch = trimmed.match(/^[*#]+\s*(.+)$/);
    if (!listMatch) continue;

    const rawEntry = listMatch[1].trim();
    // Skip pure category / template / meta links
    if (/^\[\[Category:|^\[\[:Category:/i.test(rawEntry)) continue;

    const cleaned = cleanWikiItemText(rawEntry)
      .replace(/^(?:chapter|mission|act|episode|part|stage)\s+(?:\d{1,3}|[IVX]+)\s*[:.\-–—]\s*/i, '')
      .trim();

    if (!cleaned || cleaned.length < 2 || cleaned.length > 90) continue;
    if (/^(?:none|tba|n\/a|region|mission|chapter|act)$/i.test(cleaned)) continue;

    const lower = cleaned.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    chapters.push(cleaned);
    if (chapters.length >= 120) break;
  }

  let detectedUnit: ChapterUnit = 'chapters';
  if (missionHits > chapterHits && missionHits >= actHits) detectedUnit = 'missions';
  else if (actHits > chapterHits && actHits > missionHits && chapters.length <= 10) detectedUnit = 'acts';

  return { chapters, detectedUnit };
}

async function discoverFandomGameChapters(
  rawTitle: string,
  cleanTitle: string,
  wantsDlc: boolean
): Promise<GameChapterSuggestPayload | null> {
  const words = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;

  const subdomains = Array.from(
    new Set(
      [
        words.join(''),
        words.filter((w) => !/^\d+$/.test(w)).join(''),
        words.slice(0, 2).join(''),
        words[0],
      ].filter((s) => s && s.length >= 3)
    )
  ).slice(0, 3);

  const cleanNorm = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const titleNums = cleanNorm.match(/\b\d+\b/g) || [];
  const lastNum = titleNums[titleNums.length - 1];

  const searchHits = await Promise.allSettled(
    subdomains.map(async (sub) => {
      const srUrl = `https://${sub}.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        `${cleanTitle} main missions OR chapters OR episodes`
      )}&srlimit=6&format=json`;
      const r = await fetch(srUrl, {
        headers: { 'User-Agent': 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)' },
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) return [];
      const j = (await r.json()) as { query?: { search?: Array<{ title?: string }> } };
      return (j.query?.search || []).map((s) => ({
        sub,
        pageTitle: s.title || '',
      }));
    })
  );

  const candidates: Array<{ sub: string; pageTitle: string; score: number }> = [];
  for (const res of searchHits) {
    if (res.status !== 'fulfilled') continue;
    for (const hit of res.value) {
      if (!hit.pageTitle) continue;
      const lower = hit.pageTitle.toLowerCase();
      if (/\b(?:sub missions|twilight missions|side quests|achievements|trophies|collectibles)\b/.test(lower)) {
        continue;
      }
      let score = 0;
      if (/\bmain missions\b/.test(lower)) score += 35;
      else if (/\bstory missions\b/.test(lower)) score += 32;
      else if (/\b(?:chapters|episodes|acts|missions)\b/.test(lower)) score += 24;
      else if (/\bwalkthrough\b/.test(lower)) score += 12;
      else continue;

      if (lower.includes(cleanNorm)) score += 25;
      else if (words[0] && lower.includes(words[0])) score += 8;

      if (lastNum) {
        if (new RegExp(`\\b${lastNum}\\b`).test(lower)) score += 15;
        else if (/\b\d+\b/.test(lower)) score -= 30;
      }

      candidates.push({ ...hit, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3);
  if (top.length === 0) return null;

  for (const cand of top) {
    try {
      const pageRes = await fetch(
        `https://${cand.sub}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
          cand.pageTitle
        )}&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2`,
        {
          headers: { 'User-Agent': 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)' },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (!pageRes.ok) continue;
      const pj = (await pageRes.json()) as {
        query?: {
          pages?: Array<{
            missing?: boolean;
            title?: string;
            revisions?: Array<{ slots?: { main?: { content?: string } } }>;
          }>;
        };
      };
      const page = pj.query?.pages?.find((p) => !p.missing);
      const wt = page?.revisions?.[0]?.slots?.main?.content || '';
      if (!wt) continue;
      const parsed = parseFandomMissionListFromWikitext(wt, wantsDlc);
      if (parsed.chapters.length >= 3) {
        return {
          found: true,
          unit: parsed.detectedUnit,
          source: 'fandom',
          sourceLabel: `${cand.sub}.fandom.com · ${page?.title || cand.pageTitle}`,
          note: `Suggested ${parsed.chapters.length} ${parsed.detectedUnit} from Fandom (${cand.pageTitle})`,
          chapters: parsed.chapters,
        };
      }
    } catch {
      // try next candidate
    }
  }

  void rawTitle;
  return null;
}

async function searchStrategyWikiChapters(cleanTitle: string): Promise<GameChapterSuggestPayload | null> {
  try {
    const r = await fetch(
      `https://strategywiki.org/w/api.php?action=query&titles=${encodeURIComponent(
        `${cleanTitle}/Table of Contents`
      )}&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2`,
      {
        headers: { 'User-Agent': 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      query?: {
        pages?: Array<{
          missing?: boolean;
          revisions?: Array<{ slots?: { main?: { content?: string } } }>;
        }>;
      };
    };
    const wt = j.query?.pages?.find((p) => !p.missing)?.revisions?.[0]?.slots?.main?.content || '';
    if (!wt) return null;

    const wtWalkMatch = wt.match(/Walkthrough[\s\S]*?(?=\{\{col\|3\}\}|Appendices|$)/i)?.[0] || wt;
    const chapters: string[] = [];
    const seen = new Set<string>();
    const escapedPrefix = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const m of wtWalkMatch.matchAll(
      new RegExp(`\\[\\[${escapedPrefix}\\/([^|\\]]+?)(?:\\|([^\\]]+))?\\]\\]`, 'gi')
    )) {
      const label = (m[2] || m[1] || '').trim();
      if (
        !label ||
        /^(?:walkthrough|gameplay|controls|getting started|characters|items|weapons|enemies|bosses|appendices|achievements|trophies|table of contents)$/i.test(
          label
        )
      ) {
        continue;
      }
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chapters.push(label);
      if (chapters.length >= 120) break;
    }

    if (chapters.length < 3) return null;
    return {
      found: true,
      unit: 'chapters',
      source: 'web',
      sourceLabel: `StrategyWiki · ${cleanTitle}`,
      note: `Suggested ${chapters.length} chapters from StrategyWiki`,
      chapters,
    };
  } catch {
    return null;
  }
}

/** Suggests ordered named story chapters/missions (Fandom + StrategyWiki + Wikipedia/web fallback). */
export async function fetchGameChapterSuggestPayload(
  rawTitle: string
): Promise<GameChapterSuggestPayload> {
  const trimmed = rawTitle.trim();
  if (trimmed.length < 2) {
    return { found: false, unit: 'chapters', chapters: [] };
  }

  const { cleanTitle, wantsDlc } = cleanGameTitleForSearch(trimmed);

  const [fandomHit, swHit] = await Promise.allSettled([
    discoverFandomGameChapters(trimmed, cleanTitle, wantsDlc),
    searchStrategyWikiChapters(cleanTitle),
  ]);

  if (fandomHit.status === 'fulfilled' && fandomHit.value && fandomHit.value.chapters.length >= 3) {
    return fandomHit.value;
  }
  if (swHit.status === 'fulfilled' && swHit.value && swHit.value.chapters.length >= 3) {
    return swHit.value;
  }

  const catalogHit = lookupKnownGameChapters(trimmed);
  if (catalogHit) {
    const unitSingle = catalogHit.unit === 'missions' ? 'Mission' : catalogHit.unit === 'acts' ? 'Act' : 'Chapter';
    return {
      found: true,
      unit: catalogHit.unit,
      source: 'catalog',
      sourceLabel: 'Cue Catalog',
      note: catalogHit.note,
      chapters: Array.from({ length: catalogHit.totalChapters }, (_, i) => `${unitSingle} ${i + 1}`),
    };
  }

  const wikiHit = await searchWikipediaChapters(cleanTitle);
  if (wikiHit) {
    const unitSingle = wikiHit.unit === 'missions' ? 'Mission' : wikiHit.unit === 'acts' ? 'Act' : 'Chapter';
    return {
      found: true,
      unit: wikiHit.unit,
      source: 'wikipedia',
      sourceLabel: 'Wikipedia count estimate',
      note: `${wikiHit.note} · Generic titles — edit or pull names via Google AI Mode`,
      chapters: Array.from({ length: wikiHit.totalChapters }, (_, i) => `${unitSingle} ${i + 1}`),
    };
  }

  const webHit = await searchWebSnippetChapters(cleanTitle);
  if (webHit) {
    const unitSingle = webHit.unit === 'missions' ? 'Mission' : webHit.unit === 'acts' ? 'Act' : 'Chapter';
    return {
      found: true,
      unit: webHit.unit,
      source: 'web',
      sourceLabel: 'Web count estimate',
      note: `${webHit.note} · Generic titles — edit or pull names via Google AI Mode`,
      chapters: Array.from({ length: webHit.totalChapters }, (_, i) => `${unitSingle} ${i + 1}`),
    };
  }

  return { found: false, unit: 'chapters', chapters: [] };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const title = (url.searchParams.get('title') || '').trim();
  if (title.length < 2) {
    return jsonResponse({ found: false, error: 'Missing game title' }, 400);
  }

  if (url.searchParams.get('mode') === 'suggest') {
    const suggest = await fetchGameChapterSuggestPayload(title);
    return jsonResponse(suggest, 200, suggest.found ? 43200 : 1800);
  }

  const catalogHit = lookupKnownGameChapters(title);
  if (catalogHit) {
    return jsonResponse({
      found: true,
      totalChapters: catalogHit.totalChapters,
      unit: catalogHit.unit,
      source: 'catalog',
      note: catalogHit.note || `${catalogHit.totalChapters} ${catalogHit.unit}`,
    });
  }

  const wikiHit = await searchWikipediaChapters(title);
  if (wikiHit) {
    return jsonResponse(wikiHit);
  }

  const webHit = await searchWebSnippetChapters(title);
  if (webHit) {
    return jsonResponse(webHit);
  }

  return jsonResponse({ found: false }, 200, 3600);
}
