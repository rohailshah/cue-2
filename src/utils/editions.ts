import type {
  ComicEditionFormat,
  ComicEditionId,
  ComicEditionRecord,
  GeneralizedComicEditionId,
  ReadItem,
  ReadProgress,
} from '../types';

export interface ComicEditionOption {
  id: GeneralizedComicEditionId;
  label: string;
  dcLabel?: string;
  subtitle: string;
}

export const COMIC_EDITIONS: ComicEditionOption[] = [
  {
    id: 'digital',
    label: 'Digital / Issues',
    subtitle: 'Single issues or digital reader',
  },
  {
    id: 'tpb',
    label: 'Standard TPB',
    subtitle: 'Paperbacks, Black Label & softcovers',
  },
  {
    id: 'compact',
    label: 'Compact TPB',
    dcLabel: 'DC Compact TPB',
    subtitle: 'Pocket & digest softcovers',
  },
  {
    id: 'hardcover',
    label: 'Hardcover / Collector',
    subtitle: 'Deluxe HC, Absolute & Omnibus',
  },
];

export function normalizeComicEditionId(
  edition?: ComicEditionId
): GeneralizedComicEditionId | undefined {
  if (!edition) return undefined;
  if (edition === 'absolute') return 'hardcover';
  return edition;
}

export interface ClassifiedDetailedComicEdition {
  format: ComicEditionFormat;
  category: GeneralizedComicEditionId;
  variantTag?: string;
}

export interface ClassifiedRawComicEdition {
  edition: GeneralizedComicEditionId;
  variantTag?: string;
}

export function mapFormatToCategory(format: ComicEditionFormat): GeneralizedComicEditionId {
  if (format === 'deluxe' || format === 'absolute' || format === 'omnibus' || format === 'hardcover') {
    return 'hardcover';
  }
  return format;
}

export function getComicEditionFormatLabel(format: ComicEditionFormat, isDc = false): string {
  switch (format) {
    case 'digital':
      return 'Digital / Issues';
    case 'tpb':
      return 'Standard TPB';
    case 'compact':
      return isDc ? 'DC Compact TPB' : 'Compact TPB';
    case 'hardcover':
      return 'Hardcover';
    case 'deluxe':
      return 'Deluxe HC';
    case 'absolute':
      return 'Absolute';
    case 'omnibus':
      return 'Omnibus';
  }
}

/** Classifies any raw comic printing/binding string into a specific format, generalized category, and variant tag. */
export function classifyDetailedComicEdition(
  rawTitle: string,
  physicalFormat?: string,
  pubYear?: number,
  earliestYear?: number,
  allowCompactYearFallback = false
): ClassifiedDetailedComicEdition {
  const titleLower = rawTitle.toLowerCase();
  const fmtLower = (physicalFormat || '').toLowerCase();
  const hay = `${titleLower} ${fmtLower}`.trim();

  if (/\bcompact\b|\bdigest\b|premier collection/.test(hay)) {
    return {
      format: 'compact',
      category: 'compact',
      variantTag: hay.includes('dc compact') ? 'DC Compact' : 'Compact TPB',
    };
  }

  if (/\babsolute\b/.test(hay)) {
    return { format: 'absolute', category: 'hardcover', variantTag: 'Absolute HC' };
  }
  if (/\bomnibus\b/.test(hay)) {
    return { format: 'omnibus', category: 'hardcover', variantTag: 'Omnibus' };
  }
  if (/\bcompendium\b/.test(hay)) {
    return { format: 'hardcover', category: 'hardcover', variantTag: 'Compendium' };
  }
  if (/\bdeluxe\b/.test(hay)) {
    return { format: 'deluxe', category: 'hardcover', variantTag: 'Deluxe HC' };
  }
  if (/\bslipcase\b|\bnoir\b|\bgallery edition\b|\bartist(?:'s)? edition\b/.test(hay)) {
    return { format: 'deluxe', category: 'hardcover', variantTag: 'Collector HC' };
  }
  if (
    /\bhardcover\b|\bhc\b|capa dura|tapa dura|relie/.test(hay) &&
    !/paperback|softcover|\btpb\b/.test(fmtLower)
  ) {
    const volMatch = /\b(vol\.?|volume)\s*\d+/i.test(rawTitle);
    return {
      format: 'hardcover',
      category: 'hardcover',
      variantTag: volMatch ? 'Multi-Vol HC' : 'Standard HC',
    };
  }

  if (/\bblack label\b/.test(hay)) {
    return { format: 'tpb', category: 'tpb', variantTag: 'Black Label TPB' };
  }
  if (
    /\b(tpb|tp|trade paperback|paperback|softcover|book\s*\d+|vol\.?|volume)\b/.test(hay)
  ) {
    const volMatch = /\b(vol\.?|volume)\s*\d+/i.test(rawTitle);
    return {
      format: 'tpb',
      category: 'tpb',
      variantTag: volMatch ? 'Volume TPB' : 'Standard TPB',
    };
  }

  if (allowCompactYearFallback && pubYear && earliestYear && pubYear >= 2024 && pubYear - earliestYear >= 10) {
    return { format: 'compact', category: 'compact', variantTag: 'Compact Reprint' };
  }

  if (/issue\s*#?\d+|single issue|digital|kindle|comixology/.test(hay)) {
    return { format: 'digital', category: 'digital', variantTag: 'Single Issues' };
  }

  return { format: 'digital', category: 'digital' };
}

/** Classifies any raw comic printing/binding string into one of 4 generalized formats + a short variant label. */
export function classifyRawComicEdition(
  rawTitle: string,
  physicalFormat?: string,
  pubYear?: number,
  earliestYear?: number,
  allowCompactYearFallback = false
): ClassifiedRawComicEdition {
  const detailed = classifyDetailedComicEdition(
    rawTitle,
    physicalFormat,
    pubYear,
    earliestYear,
    allowCompactYearFallback
  );
  return { edition: detailed.category, variantTag: detailed.variantTag };
}

const DC_KEYWORDS = [
  'superman',
  'batman',
  'watchmen',
  'wonder woman',
  'justice league',
  'flash',
  'green lantern',
  'sandman',
  'aquaman',
  'teen titans',
  'supergirl',
  'catwoman',
  'far sector',
  'kingdom come',
  'dceased',
  'dc comics',
  'dc compact',
  'grant morrison',
  'geoff johns',
  'joshua williamson',
  'jeph loeb',
  'frank miller',
  'alan moore',
];

export interface KnownComicEditionSpec {
  availableEditions: GeneralizedComicEditionId[];
  counts: Partial<Record<GeneralizedComicEditionId, number>>;
  covers?: Partial<Record<GeneralizedComicEditionId, string>>;
  collapsedSummary?: Partial<Record<GeneralizedComicEditionId, string>>;
  editions?: ComicEditionRecord[];
}

const SUPERMAN_BATMAN_SPEC: KnownComicEditionSpec = {
  availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
  counts: { digital: 13, tpb: 6, compact: 13, hardcover: 14 },
  covers: {
    compact: 'https://images.penguinrandomhouse.com/cover/9781799502135',
    tpb: 'https://images.penguinrandomhouse.com/cover/9781401202200',
    hardcover: 'https://images.penguinrandomhouse.com/cover/9781401240967',
  },
  collapsedSummary: {
    digital: '#1–13 Issues & Digital',
    tpb: 'Vol. 1 Public Enemies & Vol. 2 Supergirl',
    compact: 'DC Compact Comics Edition (13 issues)',
    hardcover: 'Absolute Vol. 1 & Omnibus Vol. 1',
  },
  editions: [
    {
      id: 'curated-sb-digital',
      format: 'digital',
      category: 'digital',
      title: 'Superman/Batman — Single Issues & Digital',
      shortLabel: 'Digital / Issues',
      subtitle: 'Individual issues (#1–13)',
      issueCount: 13,
      publisher: 'DC Comics',
      source: 'curated',
    },
    {
      id: 'curated-sb-compact',
      format: 'compact',
      category: 'compact',
      title: 'Superman/Batman: DC Compact Comics Edition',
      shortLabel: 'DC Compact TPB',
      subtitle: 'Collects #1–6, #8–13 & Secret Files (Public Enemies + Supergirl)',
      issueCount: 13,
      coverUrl: 'https://images.penguinrandomhouse.com/cover/9781799502135',
      year: 2025,
      publisher: 'DC Comics',
      isbn: '9781799502135',
      pageCount: 304,
      source: 'curated',
    },
    {
      id: 'curated-sb-tpb-v1',
      format: 'tpb',
      category: 'tpb',
      title: 'Superman/Batman Vol. 1: Public Enemies',
      shortLabel: 'Vol. 1: Public Enemies',
      subtitle: 'Collects Superman/Batman #1–6',
      issueCount: 6,
      coverUrl: 'https://images.penguinrandomhouse.com/cover/9781401202200',
      year: 2004,
      publisher: 'DC Comics',
      isbn: '9781401202200',
      pageCount: 160,
      source: 'curated',
    },
    {
      id: 'curated-sb-tpb-v2',
      format: 'tpb',
      category: 'tpb',
      title: 'Superman/Batman Vol. 2: Supergirl',
      shortLabel: 'Vol. 2: Supergirl',
      subtitle: 'Collects Superman/Batman #8–13',
      issueCount: 6,
      coverUrl: 'https://images.penguinrandomhouse.com/cover/9781401202507',
      year: 2005,
      publisher: 'DC Comics',
      isbn: '9781401202507',
      pageCount: 164,
      source: 'curated',
    },
    {
      id: 'curated-sb-tpb-2014',
      format: 'tpb',
      category: 'tpb',
      title: 'Superman/Batman Vol. 1 (2014 Expanded TPB)',
      shortLabel: 'Vol. 1 Expanded TPB',
      subtitle: 'Collects #1–13 & Secret Files',
      issueCount: 14,
      coverUrl: 'https://images.penguinrandomhouse.com/cover/9781401250799',
      year: 2014,
      publisher: 'DC Comics',
      isbn: '9781401250799',
      pageCount: 336,
      source: 'curated',
    },
    {
      id: 'curated-sb-absolute',
      format: 'absolute',
      category: 'hardcover',
      title: 'Absolute Superman/Batman Vol. 1',
      shortLabel: 'Absolute Vol. 1',
      subtitle: 'Oversized slipcase · Collects #1–13 & Secret Files',
      issueCount: 14,
      coverUrl: 'https://images.penguinrandomhouse.com/cover/9781401240967',
      year: 2013,
      publisher: 'DC Comics',
      isbn: '9781401240967',
      pageCount: 336,
      source: 'curated',
    },
    {
      id: 'curated-sb-omnibus',
      format: 'omnibus',
      category: 'hardcover',
      title: 'Superman/Batman Omnibus Vol. 1',
      shortLabel: 'Omnibus Vol. 1',
      subtitle: 'Collects #1–42, Annuals #1–2 & Secret Files',
      issueCount: 45,
      coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779500298',
      year: 2020,
      publisher: 'DC Comics',
      isbn: '9781779500298',
      pageCount: 1208,
      source: 'curated',
    },
  ],
};

const FLASH_REBIRTH_SPEC: KnownComicEditionSpec = {
  availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
  counts: { digital: 6, tpb: 6, compact: 13, hardcover: 6 },
  covers: {
    compact: 'https://images.penguinrandomhouse.com/cover/9781799507697',
    tpb: 'https://images.penguinrandomhouse.com/cover/9781401230012',
    hardcover: 'https://covers.openlibrary.org/b/isbn/9781401225681-L.jpg?default=false',
  },
  collapsedSummary: {
    tpb: '1st & 2nd Printing TPB',
    compact: 'DC Compact Comics (13 issues)',
    hardcover: 'Standard Hardcover (6 issues)',
  },
  editions: [
    {
      id: 'curated-fr-digital',
      format: 'digital',
      category: 'digital',
      title: 'The Flash: Rebirth (2009) — Single Issues',
      shortLabel: 'Digital / Issues',
      subtitle: 'Collects The Flash: Rebirth #1–6',
      issueCount: 6,
      publisher: 'DC Comics',
      source: 'curated',
    },
    {
      id: 'curated-fr-tpb',
      format: 'tpb',
      category: 'tpb',
      title: 'The Flash: Rebirth (Standard TPB)',
      shortLabel: 'Standard TPB',
      subtitle: '1st & 2nd Printing · Collects #1–6',
      issueCount: 6,
      coverUrl: 'https://images.penguinrandomhouse.com/cover/9781401230012',
      year: 2011,
      publisher: 'DC Comics',
      isbn: '9781401230012',
      source: 'curated',
    },
    {
      id: 'curated-fr-hc',
      format: 'hardcover',
      category: 'hardcover',
      title: 'The Flash: Rebirth (Hardcover)',
      shortLabel: 'Standard HC',
      subtitle: 'Original hardcover · Collects #1–6',
      issueCount: 6,
      coverUrl: 'https://covers.openlibrary.org/b/isbn/9781401225681-L.jpg?default=false',
      year: 2010,
      publisher: 'DC Comics',
      isbn: '9781401225681',
      source: 'curated',
    },
    {
      id: 'curated-fr-compact',
      format: 'compact',
      category: 'compact',
      title: 'The Flash: Rebirth — DC Compact Comics Edition',
      shortLabel: 'DC Compact TPB',
      subtitle: 'Collects Rebirth #1–6, The Flash #1–6 & Secret Files',
      issueCount: 13,
      coverUrl: 'https://images.penguinrandomhouse.com/cover/9781799507697',
      year: 2026,
      publisher: 'DC Comics',
      isbn: '9781799507697',
      source: 'curated',
    },
  ],
};

export const KNOWN_COMIC_EDITIONS: Record<string, KnownComicEditionSpec> = {
  'superman batman': SUPERMAN_BATMAN_SPEC,
  'superman batman public enemies': SUPERMAN_BATMAN_SPEC,
  'the flash rebirth': FLASH_REBIRTH_SPEC,
  'flash rebirth': FLASH_REBIRTH_SPEC,
  'all star superman': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527257',
      tpb: 'https://images.penguinrandomhouse.com/cover/9781401232054',
      hardcover: 'https://images.penguinrandomhouse.com/cover/9781401229177',
    },
    collapsedSummary: {
      digital: '#1–12 Issues & Digital',
      tpb: 'Standard, Black Label & Vol. 1–2 TPB',
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe HC, Absolute & Vol. 1–2 HC',
    },
    editions: [
      {
        id: 'curated-ass-digital',
        format: 'digital',
        category: 'digital',
        title: 'All-Star Superman — Single Issues & Digital',
        shortLabel: 'Digital / Issues',
        subtitle: 'Individual issues (#1–12)',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-ass-compact',
        format: 'compact',
        category: 'compact',
        title: 'All-Star Superman: DC Compact Comics Edition',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Pocket paperback · Collects All-Star Superman #1–12',
        issueCount: 12,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779527257',
        year: 2024,
        publisher: 'DC Comics',
        isbn: '9781779527257',
        source: 'curated',
      },
      {
        id: 'curated-ass-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'All-Star Superman (Complete & Black Label TPB)',
        shortLabel: 'Complete TPB',
        subtitle: 'Collects All-Star Superman #1–12',
        issueCount: 12,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781401232054',
        year: 2011,
        publisher: 'DC Comics',
        isbn: '9781401232054',
        source: 'curated',
      },
      {
        id: 'curated-ass-deluxe',
        format: 'deluxe',
        category: 'hardcover',
        title: 'All-Star Superman: The Deluxe Edition',
        shortLabel: 'Deluxe HC',
        subtitle: 'Oversized hardcover · Collects #1–12',
        issueCount: 12,
        year: 2022,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-ass-absolute',
        format: 'absolute',
        category: 'hardcover',
        title: 'Absolute All-Star Superman',
        shortLabel: 'Absolute HC',
        subtitle: 'Slipcase edition · Collects #1–12 + sketches',
        issueCount: 12,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781401229177',
        year: 2010,
        publisher: 'DC Comics',
        isbn: '9781401229177',
        source: 'curated',
      },
    ],
  },
  watchmen: {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527325',
    },
    collapsedSummary: {
      tpb: 'Standard & Modern TPB',
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe, Absolute & Noir HC',
    },
    editions: [
      {
        id: 'curated-wm-digital',
        format: 'digital',
        category: 'digital',
        title: 'Watchmen — Single Issues & Digital',
        shortLabel: 'Digital / Issues',
        subtitle: 'Original 12-issue series (#1–12)',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-wm-compact',
        format: 'compact',
        category: 'compact',
        title: 'Watchmen: DC Compact Comics Edition',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Pocket paperback · Collects Watchmen #1–12',
        issueCount: 12,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779527325',
        year: 2024,
        publisher: 'DC Comics',
        isbn: '9781779527325',
        source: 'curated',
      },
      {
        id: 'curated-wm-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Watchmen (Trade Paperback)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects Watchmen #1–12',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-wm-deluxe',
        format: 'deluxe',
        category: 'hardcover',
        title: 'Watchmen: The Deluxe Edition',
        shortLabel: 'Deluxe HC',
        subtitle: 'Oversized hardcover · Collects #1–12',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-wm-absolute',
        format: 'absolute',
        category: 'hardcover',
        title: 'Absolute Watchmen',
        shortLabel: 'Absolute HC',
        subtitle: 'Recolored slipcase · Collects #1–12',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'batman year one': {
    availableEditions: ['digital', 'tpb', 'hardcover'],
    counts: { digital: 4, tpb: 4, hardcover: 4 },
    collapsedSummary: {
      tpb: 'Standard & Black Label TPB',
      hardcover: 'Deluxe & Absolute HC',
    },
    editions: [
      {
        id: 'curated-byo-digital',
        format: 'digital',
        category: 'digital',
        title: 'Batman: Year One — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects Batman #404–407',
        issueCount: 4,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-byo-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Batman: Year One (Deluxe TPB)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects Batman #404–407',
        issueCount: 4,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-byo-absolute',
        format: 'absolute',
        category: 'hardcover',
        title: 'Absolute Batman: Year One',
        shortLabel: 'Absolute HC',
        subtitle: 'Slipcase edition · Original & remastered colors',
        issueCount: 4,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'batman hush': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 15 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527264',
    },
    collapsedSummary: {
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe, Anniversary & Absolute HC',
    },
    editions: [
      {
        id: 'curated-bh-digital',
        format: 'digital',
        category: 'digital',
        title: 'Batman: Hush — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects Batman #608–619',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-bh-compact',
        format: 'compact',
        category: 'compact',
        title: 'Batman: Hush — DC Compact Comics Edition',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Pocket paperback · Collects Batman #608–619',
        issueCount: 12,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779527264',
        year: 2024,
        publisher: 'DC Comics',
        isbn: '9781779527264',
        source: 'curated',
      },
      {
        id: 'curated-bh-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Batman: Hush (Complete TPB)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects Batman #608–619',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-bh-hc',
        format: 'deluxe',
        category: 'hardcover',
        title: 'Batman: Hush — 20th Anniversary Edition',
        shortLabel: '20th Anniv. HC',
        subtitle: 'Collects Batman #608–619 + new epilogue & extras',
        issueCount: 15,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-bh-absolute',
        format: 'absolute',
        category: 'hardcover',
        title: 'Absolute Batman: Hush',
        shortLabel: 'Absolute HC',
        subtitle: 'Oversized slipcase · Collects #608–619 + extras',
        issueCount: 15,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'batman the court of owls': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 11, tpb: 7, compact: 11, hardcover: 11 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527271',
    },
    collapsedSummary: {
      compact: 'DC Compact Saga Edition',
      hardcover: 'Collector HC & Omnibus',
    },
    editions: [
      {
        id: 'curated-coo-digital',
        format: 'digital',
        category: 'digital',
        title: 'Batman: Court of Owls — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects Batman #1–11',
        issueCount: 11,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-coo-compact',
        format: 'compact',
        category: 'compact',
        title: 'Batman: The Court of Owls Saga (DC Compact Comics)',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Complete saga · Collects Batman #1–11',
        issueCount: 11,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779527271',
        year: 2024,
        publisher: 'DC Comics',
        isbn: '9781779527271',
        source: 'curated',
      },
      {
        id: 'curated-coo-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Batman Vol. 1: The Court of Owls (TPB)',
        shortLabel: 'Vol. 1 TPB',
        subtitle: 'Collects Batman #1–7',
        issueCount: 7,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-coo-absolute',
        format: 'absolute',
        category: 'hardcover',
        title: 'Absolute Batman: The Court of Owls',
        shortLabel: 'Absolute HC',
        subtitle: 'Oversized slipcase · Collects Batman #1–11',
        issueCount: 11,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'batman the long halloween': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 13, tpb: 13, compact: 13, hardcover: 13 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799502883',
    },
    collapsedSummary: {
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe, Noir & Absolute HC',
    },
    editions: [
      {
        id: 'curated-tlh-digital',
        format: 'digital',
        category: 'digital',
        title: 'Batman: The Long Halloween — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Individual issues (#1–13)',
        issueCount: 13,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-tlh-compact',
        format: 'compact',
        category: 'compact',
        title: 'Batman: The Long Halloween (DC Compact Comics Edition)',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Pocket paperback · Collects #1–13',
        issueCount: 13,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781799502883',
        year: 2025,
        publisher: 'DC Comics',
        isbn: '9781799502883',
        source: 'curated',
      },
      {
        id: 'curated-tlh-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Batman: The Long Halloween (Trade Paperback)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects #1–13',
        issueCount: 13,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-tlh-deluxe',
        format: 'deluxe',
        category: 'hardcover',
        title: 'Batman: The Long Halloween — Deluxe Edition',
        shortLabel: 'Deluxe HC',
        subtitle: 'Oversized hardcover · Collects #1–13',
        issueCount: 13,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-tlh-absolute',
        format: 'absolute',
        category: 'hardcover',
        title: 'Absolute Batman: The Long Halloween',
        shortLabel: 'Absolute HC',
        subtitle: 'Slipcase edition · Collects #1–13',
        issueCount: 13,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'kingdom come': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 4, tpb: 4, compact: 4, hardcover: 4 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799501299',
    },
    collapsedSummary: {
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe & Absolute HC',
    },
    editions: [
      {
        id: 'curated-kc-digital',
        format: 'digital',
        category: 'digital',
        title: 'Kingdom Come — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Original 4-issue miniseries (#1–4)',
        issueCount: 4,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-kc-compact',
        format: 'compact',
        category: 'compact',
        title: 'Kingdom Come: DC Compact Comics Edition',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Pocket paperback · Collects #1–4',
        issueCount: 4,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781799501299',
        year: 2025,
        publisher: 'DC Comics',
        isbn: '9781799501299',
        source: 'curated',
      },
      {
        id: 'curated-kc-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Kingdom Come (Trade Paperback)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects #1–4',
        issueCount: 4,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-kc-absolute',
        format: 'absolute',
        category: 'hardcover',
        title: 'Absolute Kingdom Come',
        shortLabel: 'Absolute HC',
        subtitle: 'Oversized slipcase · Collects #1–4',
        issueCount: 4,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'supergirl woman of tomorrow': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 8, tpb: 8, compact: 8, hardcover: 8 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799506904',
    },
    editions: [
      {
        id: 'curated-swot-digital',
        format: 'digital',
        category: 'digital',
        title: 'Supergirl: Woman of Tomorrow — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects #1–8',
        issueCount: 8,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-swot-compact',
        format: 'compact',
        category: 'compact',
        title: 'Supergirl: Woman of Tomorrow (DC Compact Comics Edition)',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Pocket paperback · Collects #1–8',
        issueCount: 8,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781799506904',
        year: 2026,
        publisher: 'DC Comics',
        isbn: '9781799506904',
        source: 'curated',
      },
      {
        id: 'curated-swot-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Supergirl: Woman of Tomorrow (Trade Paperback)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects #1–8',
        issueCount: 8,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-swot-deluxe',
        format: 'deluxe',
        category: 'hardcover',
        title: 'Supergirl: Woman of Tomorrow — The Deluxe Edition',
        shortLabel: 'Deluxe HC',
        subtitle: 'Oversized hardcover · Collects #1–8',
        issueCount: 8,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'superman birthright': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799501916',
    },
    editions: [
      {
        id: 'curated-sbr-digital',
        format: 'digital',
        category: 'digital',
        title: 'Superman: Birthright — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects #1–12',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-sbr-compact',
        format: 'compact',
        category: 'compact',
        title: 'Superman: Birthright — DC Compact Comics Edition',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Pocket paperback · Collects #1–12',
        issueCount: 12,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781799501916',
        year: 2025,
        publisher: 'DC Comics',
        isbn: '9781799501916',
        source: 'curated',
      },
      {
        id: 'curated-sbr-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Superman: Birthright (Trade Paperback)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects #1–12',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-sbr-deluxe',
        format: 'deluxe',
        category: 'hardcover',
        title: 'Superman: Birthright — The Deluxe Edition',
        shortLabel: 'Deluxe HC',
        subtitle: 'Oversized hardcover · Collects #1–12',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'far sector': {
    availableEditions: ['digital', 'tpb', 'compact'],
    counts: { digital: 12, tpb: 12, compact: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527295',
    },
    editions: [
      {
        id: 'curated-fs-digital',
        format: 'digital',
        category: 'digital',
        title: 'Far Sector — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects Far Sector #1–12',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-fs-compact',
        format: 'compact',
        category: 'compact',
        title: 'Far Sector: DC Compact Comics Edition',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Pocket paperback · Collects #1–12',
        issueCount: 12,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779527295',
        year: 2024,
        publisher: 'DC Comics',
        isbn: '9781779527295',
        source: 'curated',
      },
      {
        id: 'curated-fs-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'Far Sector (Trade Paperback)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects #1–12',
        issueCount: 12,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  dceased: {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 6, tpb: 6, compact: 8, hardcover: 14 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799501633',
    },
    collapsedSummary: {
      hardcover: 'Standard HC & Omnibus',
    },
    editions: [
      {
        id: 'curated-dce-digital',
        format: 'digital',
        category: 'digital',
        title: 'DCeased — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects DCeased #1–6',
        issueCount: 6,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-dce-compact',
        format: 'compact',
        category: 'compact',
        title: 'DCeased: DC Compact Comics Edition',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Collects DCeased #1–6 + A Good Day to Die',
        issueCount: 8,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781799501633',
        year: 2025,
        publisher: 'DC Comics',
        isbn: '9781799501633',
        source: 'curated',
      },
      {
        id: 'curated-dce-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'DCeased (Trade Paperback)',
        shortLabel: 'Standard TPB',
        subtitle: 'Collects DCeased #1–6',
        issueCount: 6,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-dce-omnibus',
        format: 'omnibus',
        category: 'hardcover',
        title: 'DCeased Omnibus',
        shortLabel: 'Omnibus HC',
        subtitle: 'Complete saga collection',
        issueCount: 14,
        publisher: 'DC Comics',
        source: 'curated',
      },
    ],
  },
  'american vampire': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 11, tpb: 5, compact: 11, hardcover: 34 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527349',
    },
    collapsedSummary: {
      hardcover: 'Hardcover & Omnibus (34 issues)',
    },
    editions: [
      {
        id: 'curated-av-digital',
        format: 'digital',
        category: 'digital',
        title: 'American Vampire — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects #1–11',
        issueCount: 11,
        publisher: 'Vertigo / DC',
        source: 'curated',
      },
      {
        id: 'curated-av-compact',
        format: 'compact',
        category: 'compact',
        title: 'American Vampire Book One (DC Compact Comics)',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Collects American Vampire #1–11',
        issueCount: 11,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779527349',
        year: 2024,
        publisher: 'DC Comics',
        isbn: '9781779527349',
        source: 'curated',
      },
      {
        id: 'curated-av-tpb',
        format: 'tpb',
        category: 'tpb',
        title: 'American Vampire Vol. 1 (TPB)',
        shortLabel: 'Vol. 1 TPB',
        subtitle: 'Collects #1–5',
        issueCount: 5,
        publisher: 'Vertigo / DC',
        source: 'curated',
      },
      {
        id: 'curated-av-omnibus',
        format: 'omnibus',
        category: 'hardcover',
        title: 'American Vampire Omnibus Vol. 1',
        shortLabel: 'Omnibus Vol. 1',
        subtitle: 'Collects #1–27 & Survival of the Fittest',
        issueCount: 34,
        publisher: 'DC Black Label',
        source: 'curated',
      },
    ],
  },
  'wonder woman earth one': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 3, tpb: 3, compact: 9, hardcover: 9 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527332',
    },
    editions: [
      {
        id: 'curated-wweo-digital',
        format: 'digital',
        category: 'digital',
        title: 'Wonder Woman: Earth One — Original Volumes',
        shortLabel: 'Digital / Issues',
        subtitle: 'Volumes 1–3',
        issueCount: 3,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-wweo-compact',
        format: 'compact',
        category: 'compact',
        title: 'Wonder Woman: Earth One (DC Compact Comics Edition)',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Complete Trilogy · Volumes 1–3',
        issueCount: 9,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779527332',
        year: 2024,
        publisher: 'DC Comics',
        isbn: '9781779527332',
        source: 'curated',
      },
    ],
  },
  'catwoman trail of the catwoman': {
    availableEditions: ['digital', 'tpb', 'compact'],
    counts: { digital: 9, tpb: 9, compact: 11 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527288',
    },
    editions: [
      {
        id: 'curated-cat-digital',
        format: 'digital',
        category: 'digital',
        title: 'Catwoman: Trail of the Catwoman — Single Issues',
        shortLabel: 'Digital / Issues',
        subtitle: 'Collects Catwoman #1–9',
        issueCount: 9,
        publisher: 'DC Comics',
        source: 'curated',
      },
      {
        id: 'curated-cat-compact',
        format: 'compact',
        category: 'compact',
        title: 'Catwoman: Trail of the Catwoman (DC Compact Comics)',
        shortLabel: 'DC Compact TPB',
        subtitle: 'Collects Selina’s Big Score & Catwoman #1–9',
        issueCount: 11,
        coverUrl: 'https://images.penguinrandomhouse.com/cover/9781779527288',
        year: 2024,
        publisher: 'DC Comics',
        isbn: '9781779527288',
        source: 'curated',
      },
    ],
  },
  saga: {
    availableEditions: ['digital', 'tpb', 'hardcover'],
    counts: { digital: 72, tpb: 6, hardcover: 18 },
    collapsedSummary: {
      hardcover: 'Deluxe HC Books & Compendium',
    },
  },
  invincible: {
    availableEditions: ['digital', 'tpb', 'hardcover'],
    counts: { digital: 144, tpb: 6, hardcover: 47 },
    collapsedSummary: {
      hardcover: 'Ultimate Collection & Compendium HC',
    },
  },
};

function normalizeEditionLookupKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getKnownComicEditionSpec(title: string): KnownComicEditionSpec | undefined {
  const norm = normalizeEditionLookupKey(title);
  if (!norm) return undefined;
  if (KNOWN_COMIC_EDITIONS[norm]) {
    return KNOWN_COMIC_EDITIONS[norm];
  }
  const matchedKey = Object.keys(KNOWN_COMIC_EDITIONS).find(
    (k) => norm === k || norm.startsWith(`${k} `)
  );
  return matchedKey ? KNOWN_COMIC_EDITIONS[matchedKey] : undefined;
}

export function getKnownComicEditionCounts(
  title: string
): Partial<Record<GeneralizedComicEditionId, number>> | undefined {
  const spec = getKnownComicEditionSpec(title);
  return spec ? { ...spec.counts } : undefined;
}

export function getKnownComicEditionCovers(
  title: string
): Partial<Record<GeneralizedComicEditionId, string>> | undefined {
  const spec = getKnownComicEditionSpec(title);
  return spec?.covers ? { ...spec.covers } : undefined;
}

export function getAvailableComicEditions(
  item: Pick<ReadItem, 'title' | 'editionCovers' | 'editionIssueCounts'>,
  activeEdition?: ComicEditionId
): ComicEditionOption[] {
  const normalizedActive = normalizeComicEditionId(activeEdition);
  const spec = getKnownComicEditionSpec(item.title);
  if (spec) {
    const allowed = new Set<GeneralizedComicEditionId>(spec.availableEditions);
    return COMIC_EDITIONS.filter((opt) => allowed.has(opt.id));
  }

  return COMIC_EDITIONS.filter((opt) => {
    if (opt.id === 'digital' || opt.id === 'tpb') return true;
    if (normalizedActive === opt.id) return true;
    if (opt.id === 'hardcover') {
      return Boolean(
        item.editionCovers?.hardcover ||
          item.editionIssueCounts?.hardcover ||
          item.editionCovers?.absolute ||
          item.editionIssueCounts?.absolute
      );
    }
    return Boolean(item.editionCovers?.[opt.id] || item.editionIssueCounts?.[opt.id]);
  });
}

export function resolveComicEditionCover(
  item: Pick<ReadItem, 'title' | 'coverUrl' | 'editionCovers' | 'editions'>,
  edition?: ComicEditionId,
  progress?: Pick<ReadProgress, 'editionId' | 'editionCoverUrl'>
): string {
  if (progress?.editionCoverUrl) return progress.editionCoverUrl;
  if (progress?.editionId && item.editions?.length) {
    const matched = item.editions.find((ed) => ed.id === progress.editionId);
    if (matched?.coverUrl) return matched.coverUrl;
  }
  const normalized = normalizeComicEditionId(edition);
  if (!normalized) return item.coverUrl;
  const curatedCover = getKnownComicEditionCovers(item.title)?.[normalized];
  if (curatedCover) return curatedCover;
  if (normalized === 'hardcover') {
    return item.editionCovers?.hardcover || item.editionCovers?.absolute || item.coverUrl;
  }
  return item.editionCovers?.[normalized] || item.coverUrl;
}

export function resolveComicEditionTotal(
  item: Pick<ReadItem, 'title' | 'totalUnits' | 'baseTotalUnits' | 'editionIssueCounts'>,
  edition?: ComicEditionId
): number {
  const normalized = normalizeComicEditionId(edition);
  if (!normalized) return item.totalUnits;
  const spec = getKnownComicEditionSpec(item.title);
  if (spec) {
    const curatedForEd = spec.counts[normalized];
    if (typeof curatedForEd === 'number' && curatedForEd > 0) return curatedForEd;
  }
  const fromItem =
    item.editionIssueCounts?.[normalized] ??
    (normalized === 'hardcover' ? item.editionIssueCounts?.absolute : undefined);
  if (typeof fromItem === 'number' && fromItem > 0) return fromItem;
  return item.baseTotalUnits ?? item.totalUnits;
}

export function isDcComic(item?: Pick<ReadItem, 'title' | 'creator' | 'genres'>): boolean {
  if (!item) return false;
  const hay = `${item.title} ${item.creator} ${item.genres.join(' ')}`.toLowerCase();
  return DC_KEYWORDS.some((kw) => hay.includes(kw));
}

export function getComicEditionLabel(
  edition: ComicEditionId | undefined,
  item?: Pick<ReadItem, 'title' | 'creator' | 'genres'>,
  progress?: Pick<ReadProgress, 'editionTitle'>
): string {
  if (progress?.editionTitle) return progress.editionTitle;
  const normalized = normalizeComicEditionId(edition);
  if (!normalized) return '';
  const opt = COMIC_EDITIONS.find((e) => e.id === normalized);
  if (!opt) return '';
  if (opt.dcLabel && isDcComic(item)) return opt.dcLabel;
  return opt.label;
}

export function getComicEditionSummary(
  item: Pick<ReadItem, 'title' | 'editionVariants'>,
  editionId: GeneralizedComicEditionId
): string {
  const curated = getKnownComicEditionSpec(item.title)?.collapsedSummary?.[editionId];
  if (curated) return curated;
  const variants = item.editionVariants?.[editionId];
  if (variants && variants.length > 0) {
    return variants.slice(0, 3).join(' · ');
  }
  return COMIC_EDITIONS.find((o) => o.id === editionId)?.subtitle || '';
}

const EDITION_FORMAT_ORDER: Record<ComicEditionFormat, number> = {
  digital: 0,
  compact: 1,
  tpb: 2,
  hardcover: 3,
  deluxe: 4,
  absolute: 5,
  omnibus: 6,
};

export function sortComicEditionRecords(records: ComicEditionRecord[]): ComicEditionRecord[] {
  return [...records].sort((a, b) => {
    const orderDiff = (EDITION_FORMAT_ORDER[a.format] ?? 9) - (EDITION_FORMAT_ORDER[b.format] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return (a.year || 9999) - (b.year || 9999);
  });
}

export function mergeComicEditionCatalog(
  base: ComicEditionRecord[],
  incoming: ComicEditionRecord[]
): ComicEditionRecord[] {
  const result: ComicEditionRecord[] = [];
  const seenIds = new Set<string>();
  const seenIsbns = new Set<string>();
  const seenKeys = new Set<string>();

  const pushIfUnique = (rec: ComicEditionRecord) => {
    const cleanId = rec.id.trim();
    if (!cleanId || seenIds.has(cleanId)) return;
    const cleanIsbn = rec.isbn?.replace(/[^0-9X]/gi, '').toUpperCase();
    if (cleanIsbn && seenIsbns.has(cleanIsbn)) return;
    const normTitle = normalizeEditionLookupKey(rec.title);
    const sig = `${rec.format}::${normTitle}::${rec.issueCount}`;
    if (seenKeys.has(sig)) return;
    if (rec.format === 'digital' && result.some((r) => r.format === 'digital')) return;

    seenIds.add(cleanId);
    if (cleanIsbn) seenIsbns.add(cleanIsbn);
    seenKeys.add(sig);
    result.push({ ...rec, isbn: cleanIsbn || rec.isbn });
  };

  for (const r of base) pushIfUnique(r);
  for (const r of incoming) pushIfUnique(r);
  return sortComicEditionRecords(result);
}

/** Returns curated or baseline ComicEditionRecord options immediately before live discovery completes. */
export function getCuratedComicEditionRecords(
  item: Pick<
    ReadItem,
    | 'title'
    | 'creator'
    | 'genres'
    | 'coverUrl'
    | 'totalUnits'
    | 'baseTotalUnits'
    | 'editionCovers'
    | 'editionIssueCounts'
    | 'editions'
  >
): ComicEditionRecord[] {
  const spec = getKnownComicEditionSpec(item.title);
  const curated = spec?.editions ? [...spec.editions] : [];
  const saved = item.editions ? [...item.editions] : [];

  let merged = mergeComicEditionCatalog(curated, saved);

  if (merged.length === 0) {
    const fallbackOpts = getAvailableComicEditions(item);
    merged = fallbackOpts.map((opt) => {
      const label = opt.dcLabel && isDcComic(item) ? opt.dcLabel : opt.label;
      const count = resolveComicEditionTotal(item, opt.id);
      const cover = resolveComicEditionCover(item, opt.id);
      return {
        id: `baseline-${opt.id}`,
        format: opt.id,
        category: opt.id,
        title: `${item.title} (${label})`,
        shortLabel: label,
        subtitle: opt.subtitle,
        issueCount: Math.max(1, count),
        coverUrl: cover,
        source: 'curated',
      };
    });
  } else if (!merged.some((r) => r.format === 'digital')) {
    merged = sortComicEditionRecords([
      {
        id: 'baseline-digital',
        format: 'digital',
        category: 'digital',
        title: `${item.title} — Single Issues & Digital`,
        shortLabel: 'Digital / Issues',
        subtitle: 'Individual issues',
        issueCount: Math.max(1, item.baseTotalUnits ?? item.totalUnits),
        coverUrl: item.coverUrl,
        source: 'curated',
      },
      ...merged,
    ]);
  }

  return merged;
}
