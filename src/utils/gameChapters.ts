export type ChapterUnit = 'chapters' | 'acts' | 'missions' | 'milestones';
export type ChapterSource = 'catalog' | 'wikipedia' | 'web' | 'manual';

export interface GameChapterLookupResult {
  totalChapters: number;
  unit: ChapterUnit;
  source: ChapterSource;
  note?: string;
}

export const KNOWN_GAME_CHAPTERS: Record<
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

export function normalizeGameTitleKey(title: string): string {
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

export interface OfficialGameChapter {
  title: string;
  summary?: string;
}

const FF7_REBIRTH_CHAPTERS: OfficialGameChapter[] = [
  { title: 'Fall of a Hero', summary: 'Flashback to Nibelheim as Cloud and Sephiroth investigate the mako reactor.' },
  { title: 'A New Journey Begins', summary: 'Out of Midgar into the Grasslands, Kalm, and the Chocobo Ranch.' },
  { title: 'Deeper into Darkness', summary: 'Tracking the robed figures through the Mythril Mine toward Junon.' },
  { title: 'Dawn of a New Era', summary: 'Infiltrating Upper Junon ahead of Rufus Shinra’s parade.' },
  { title: 'Blood in the Water', summary: 'Aboard the Shinra-8 crossing the sea to Costa del Sol.' },
  { title: "Fool's Paradise", summary: 'Costa del Sol resort downtime before climbing Mt. Corel.' },
  { title: 'Those Left Behind', summary: 'Mt. Corel reactor trail leading to North Corel and Barret’s past.' },
  { title: 'All That Glitters', summary: 'The Gold Saucer and the desert prison beneath Corel.' },
  { title: 'The Planet Stirs', summary: 'Gongaga Village and Tifa’s encounter in the Lifestream.' },
  { title: 'Watcher of the Vale', summary: 'Cosmo Canyon, Bugenhagen’s observatory, and the Cave of the Gi.' },
  { title: 'The Long Shadow of Shinra', summary: 'Returning to Nibelheim and the secret beneath Shinra Manor.' },
  { title: 'A Golden Key', summary: 'Collecting the Keystone from Don Corneo and the Turks at the Gold Saucer.' },
  { title: 'Where Angels Fear to Tread', summary: 'Entering the Temple of the Ancients ahead of Shinra forces.' },
  { title: 'The End of the World', summary: 'The Forgotten Capital and the final confrontation with Sephiroth.' },
];

const FF7_REMAKE_CHAPTERS: OfficialGameChapter[] = [
  { title: 'The Destruction of Mako Reactor 1' },
  { title: 'Fateful Encounters' },
  { title: 'Home Sweet Slum' },
  { title: 'Mad Dash' },
  { title: 'Dogged Pursuit' },
  { title: 'Light the Way' },
  { title: 'A Trap Is Sprung' },
  { title: 'Budding Bodyguard' },
  { title: 'The Town That Never Sleeps' },
  { title: 'Rough Waters' },
  { title: 'Haunted' },
  { title: 'Fight for Survival' },
  { title: 'A Broken World' },
  { title: 'In Search of Hope' },
  { title: 'The Day Midgar Stood Still' },
  { title: 'The Belly of the Beast' },
  { title: 'Deliverance from Chaos' },
  { title: "Destiny's Crossroads" },
];

const TLOU1_CHAPTERS: OfficialGameChapter[] = [
  { title: 'Hometown', summary: 'Outbreak Night in Austin, Texas.' },
  { title: 'The Quarantine Zone', summary: 'Twenty years later in the Boston QZ with Tess.' },
  { title: 'The Outskirts', summary: 'Smuggling Ellie past the Capitol building.' },
  { title: "Bill's Town", summary: 'Sourcing a working battery in Lincoln.' },
  { title: 'Pittsburgh', summary: 'Ambushed by Hunters and teaming up with Henry and Sam.' },
  { title: 'The Suburbs', summary: 'Escaping through the sewers and suburban streets.' },
  { title: "Tommy's Dam", summary: 'Reuniting with Tommy at the hydroelectric plant in Wyoming.' },
  { title: 'The University', summary: 'Searching the Eastern Colorado campus for the Fireflies.' },
  { title: 'Lakeside Resort', summary: 'Winter survival in Silver Lake.' },
  { title: 'Bus Depot', summary: 'Spring arrives on the outskirts of Salt Lake City.' },
  { title: 'The Firefly Lab', summary: 'St. Mary’s Hospital.' },
  { title: 'Jackson', summary: 'Epilogue on the overlook above Tommy’s settlement.' },
];

const RE4_CHAPTERS: OfficialGameChapter[] = [
  { title: 'Village Square', summary: 'Leon arrives at the Spanish countryside in search of Ashley.' },
  { title: 'Village Chief’s Manor', summary: 'Detained at the abandoned factory and infiltrating Méndez’s manor.' },
  { title: 'The Lake & Church', summary: 'Crossing the church grounds and facing Del Lago.' },
  { title: 'El Gigante & Mural', summary: 'Collecting the Apostate’s and Blasphemer’s Heads around the lake.' },
  { title: 'Villa Siege', summary: 'Extracting Ashley and defending the farmstead cabin with Luis.' },
  { title: 'Checkpoint & Slaughterhouse', summary: 'Escaping the valley past the Bella Sisters and Bitores Méndez.' },
  { title: 'The Castle Gate', summary: 'Entering Salazar’s fortress and unlocking the Treasury.' },
  { title: 'Wine Cellar & Ramparts', summary: 'Separated in the battlements as Ada makes contact.' },
  { title: 'Grand Hall & Courtyard', summary: 'Maze gardens and the three statues in the Grand Hall.' },
  { title: 'Ballroom & Depths', summary: 'Novistador hive, twin Garradors, and the underground Verdugo.' },
  { title: 'Mines & Hive', summary: 'Teaming up with Luis in the rail carts against Krauser.' },
  { title: 'Clock Tower', summary: 'Ascending the Clock Tower to confront Ramón Salazar.' },
  { title: 'Island Wharf', summary: 'Infiltrating the military facility and discovering Regeneradors.' },
  { title: 'Cargo Depot & Ruins', summary: 'Amber storeroom and the final duel with Krauser.' },
  { title: 'Fortress Summit', summary: 'Fighting through anti-air emplacements to reach the Sanctuary.' },
  { title: 'Final Confrontation', summary: 'Removing the Plaga, facing Osmund Saddler, and escaping the island.' },
];

const ALAN_WAKE_2_CHAPTERS: OfficialGameChapter[] = [
  { title: 'Invitation (Return 1)' },
  { title: 'The Heart (Return 2)' },
  { title: 'Late Night (Initiation 1)' },
  { title: 'Casey (Initiation 2)' },
  { title: 'Haunting (Initiation 3)' },
  { title: 'Local Girl (Return 3)' },
  { title: 'We Sing (Initiation 4)' },
  { title: 'Room 665 (Initiation 5)' },
  { title: 'No Chance (Return 4)' },
  { title: 'Return (Initiation 6)' },
  { title: 'Old Gods (Return 5)' },
  { title: 'Masks (Initiation 7)' },
  { title: "Zane's Film (Initiation 8)" },
  { title: 'Scratch (Return 6)' },
  { title: 'Gone (Initiation 9)' },
  { title: 'Summoning (Return 7)' },
  { title: 'Deerfest (Return 8)' },
  { title: 'Come Home (Return 9)' },
  { title: 'Final Draft (Endgame)' },
];

export const KNOWN_GAME_CHAPTER_TITLES: Record<string, OfficialGameChapter[]> = {
  'final fantasy vii rebirth': FF7_REBIRTH_CHAPTERS,
  'final fantasy 7 rebirth': FF7_REBIRTH_CHAPTERS,
  'final fantasy vii remake': FF7_REMAKE_CHAPTERS,
  'final fantasy 7 remake': FF7_REMAKE_CHAPTERS,
  'the last of us': TLOU1_CHAPTERS,
  'the last of us part i': TLOU1_CHAPTERS,
  'the last of us part ii': [
    { title: 'Jackson' },
    { title: 'Seattle Day 1 (Ellie)' },
    { title: 'Seattle Day 2 (Ellie)' },
    { title: 'Seattle Day 3 (Ellie)' },
    { title: 'The Park' },
    { title: 'Seattle Day 1 (Abby)' },
    { title: 'Seattle Day 2 (Abby)' },
    { title: 'Seattle Day 3 (Abby)' },
    { title: 'The Theater' },
    { title: 'The Farm' },
    { title: 'Santa Barbara' },
  ],
  'red dead redemption 2': [
    { title: 'Colter', summary: 'Snowbound camp in the Grizzlies after Blackwater.' },
    { title: 'Horseshoe Overlook', summary: 'New camp overlooking the Heartlands near Valentine.' },
    { title: 'Clemens Point', summary: 'Scarlett Meadows near Rhodes and Flat Iron Lake.' },
    { title: 'Shady Belle', summary: 'Lemoyne swamps outside Saint Denis.' },
    { title: 'Guarma', summary: 'Shipwrecked on the Caribbean island.' },
    { title: 'Beaver Hollow', summary: 'Roanoke Ridge and the gang’s final stretch.' },
    { title: 'Epilogue, Part I: Pronghorn Ranch' },
    { title: 'Epilogue, Part II: Beecher’s Hope' },
  ],
  'god of war ragnarok': [
    { title: 'Surviving Fimbulwinter' },
    { title: 'The Quest for Tyr' },
    { title: 'Old Friends' },
    { title: "Groa's Secret" },
    { title: 'The Lost Sanctuary' },
    { title: 'The Reckoning' },
    { title: 'The Runaway' },
    { title: 'Into the Fire' },
    { title: 'The Word of Fate' },
    { title: 'Forging Destiny' },
    { title: 'Unleashing Hel' },
    { title: 'Reunion' },
    { title: 'Creatures of Prophecy' },
    { title: 'Unlocking the Mask' },
    { title: 'Hunting for Solace' },
    { title: 'The Summoning' },
    { title: 'The Realms at War' },
    { title: 'Beyond Ragnarok' },
  ],
  'resident evil 4': RE4_CHAPTERS,
  'resident evil 4 remake': RE4_CHAPTERS,
  'black myth wukong': [
    { title: 'Black Cloud, Red Fire', summary: 'Black Wind Mountain' },
    { title: 'Yellow Sand, Desolate Dusk', summary: 'Yellow Wind Ridge' },
    { title: 'White Snow, Ice Cold', summary: 'The New West' },
    { title: 'Rosy Cheeks, Gray Hair', summary: 'Webbed Hollow' },
    { title: 'Golden Child, Crimson Blood', summary: 'Flaming Mountains' },
    { title: 'Unfinished', summary: 'Mount Huaguo' },
  ],
  'baldurs gate 3': [
    { title: 'Act 1: Wilderness, Underdark & Mountain Pass' },
    { title: 'Act 2: Shadow-Cursed Lands & Moonrise Towers' },
    { title: "Act 3: Rivington, Lower City & Elder Brain" },
  ],
  'baldurs gate iii': [
    { title: 'Act 1: Wilderness, Underdark & Mountain Pass' },
    { title: 'Act 2: Shadow-Cursed Lands & Moonrise Towers' },
    { title: "Act 3: Rivington, Lower City & Elder Brain" },
  ],
  'ghost of tsushima': [
    { title: 'Shadow of the Samurai', summary: 'Izuhara & Castle Kaneda' },
    { title: 'Rise of the Ghost', summary: 'Toyotama & Castle Shimura' },
    { title: 'Kill the Khan', summary: 'Kamiagata & Port Izumi' },
  ],
  'cyberpunk 2077': [
    { title: 'Act 1: The Heist', summary: 'Watson lockdown & Konpeki Plaza' },
    { title: 'Act 2: Night City Open World', summary: 'Tracking down the Relic’s creators' },
    { title: 'Act 3: Nocturne Op55N1', summary: 'Mikoshi & Endgame Epilogues' },
  ],
  'clair obscur expedition 33': [
    { title: 'Act 1: Gustave' },
    { title: 'Act 2: Verso' },
    { title: 'Act 3: Maelle' },
  ],
  'alan wake 2': ALAN_WAKE_2_CHAPTERS,
  'alan wake ii': ALAN_WAKE_2_CHAPTERS,
  'death stranding': [
    { title: 'Prologue: Porter' },
    { title: 'Episode 1: Bridget' },
    { title: 'Episode 2: Amelie' },
    { title: 'Episode 3: Fragile' },
    { title: 'Episode 4: Unger' },
    { title: 'Episode 5: Mama' },
    { title: 'Episode 6: Deadman' },
    { title: 'Episode 7: Clifford' },
    { title: 'Episode 8: Heartman' },
    { title: 'Episode 9: Higgs' },
    { title: 'Episode 10: Die-Hardman' },
    { title: 'Episode 11: Clifford Unger' },
    { title: 'Episode 12: Bridges' },
    { title: 'Episode 13: Sam Strand' },
    { title: 'Episode 14: Lou' },
  ],
  celeste: [
    { title: 'Forsaken City' },
    { title: 'Old Site' },
    { title: 'Celestial Resort' },
    { title: 'Golden Ridge' },
    { title: 'Mirror Temple' },
    { title: 'Reflection' },
    { title: 'The Summit' },
    { title: 'Core' },
    { title: 'Farewell' },
  ],
  'it takes two': [
    { title: 'The Shed' },
    { title: 'The Tree' },
    { title: "Rose's Room" },
    { title: 'Cuckoo Clock' },
    { title: 'Snow Globe' },
    { title: 'Garden' },
    { title: 'The Attic' },
  ],
  'split fiction': [
    { title: 'Rader Publishing' },
    { title: 'Neon Revenge' },
    { title: 'Hopes of Spring' },
    { title: 'Final Dawn' },
    { title: 'Rise of the Dragon Realm' },
    { title: 'Isolation' },
    { title: 'The Hollow' },
    { title: 'Split' },
  ],
};

export function getOfficialGameChapter(
  title: string,
  chapterNumber: number
): OfficialGameChapter | null {
  if (!title || chapterNumber < 1) return null;
  const norm = normalizeGameTitleKey(title);
  const rawWithRemake = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const exact = KNOWN_GAME_CHAPTER_TITLES[rawWithRemake] || KNOWN_GAME_CHAPTER_TITLES[norm];
  const list =
    exact ||
    Object.entries(KNOWN_GAME_CHAPTER_TITLES).find(([k]) => {
      const checkSuffix = (str: string) =>
        str.startsWith(`${k} `) &&
        !/^(?:\d+|ii|iii|iv|v|vi|x|part|rebirth)\b/i.test(str.slice(k.length + 1));
      return checkSuffix(rawWithRemake) || checkSuffix(norm);
    })?.[1];

  if (!list) return null;
  return list[chapterNumber - 1] || null;
}

export function lookupKnownGameChapters(title: string): GameChapterLookupResult | null {
  const norm = normalizeGameTitleKey(title);
  if (!norm) return null;

  // Check exact match or raw normalized (preserving "remake" when part of title like FFVII Remake / RE4 Remake)
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
    source: 'catalog',
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

export function parseChapterCountFromText(
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

  // Explicit count phrases: "23 chapters", "features 16 main story chapters", "total of 20 missions", "3 acts"
  const digitRegex =
    /(?:\b(?:are|has|have|with|features?|includes?|contains?|consists?\s+of|divided\s+into|split\s+into|spanning|total\s+of|all)\s+)?\b(\d{1,2})\s+(?:main\s+|story\s+|campaign\s+|playable\s+|total\s+|separate\s+|unique\s+)?(chapters|acts|missions)\b/gi;
  for (const m of text.matchAll(digitRegex)) {
    const val = Number(m[1]);
    const weight = m[0].trim().length > m[1].length + m[2].length + 2 ? 4 : 2;
    recordHit(val, m[2], weight);
  }

  // Word numbers: "three acts", "sixteen chapters"
  const wordKeys = Object.keys(NUMBER_WORDS).join('|');
  const wordRegex = new RegExp(
    `\\b(${wordKeys})\\s+(?:main\\s+|story\\s+|campaign\\s+)?(chapters|acts|missions)\\b`,
    'gi'
  );
  for (const m of text.matchAll(wordRegex)) {
    const val = NUMBER_WORDS[m[1].toLowerCase()];
    if (val) recordHit(val, m[2], 3);
  }

  // Ordinal walkthrough heading fallback: pick highest Chapter N when at least 3 distinct chapter headings exist
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

/** Parses messy text pasted from Google AI Mode, LLMs, or walkthroughs into an ordered list of chapters/missions. */
export function parsePastedChapterList(rawText: string): {
  chapters: string[];
  detectedUnit: ChapterUnit;
} {
  if (!rawText || !rawText.trim()) {
    return { chapters: [], detectedUnit: 'chapters' };
  }

  let missionSignals = 0;
  let actSignals = 0;
  let milestoneSignals = 0;
  let chapterSignals = 0;

  const lines = rawText.replace(/\r/g, '').split('\n');
  const chapters: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Strip markdown links [Label](url) -> Label and formatting markers
    line = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#+\s*/, '')
      .trim();

    if (!line) continue;
    // Skip conversational headers / section banners / notes
    if (
      /^(?:here(?:'s| is)|below is|the main|main story|base game|dlc\b|optional|side\s+(?:missions?|quests?)|twilight missions?|note:|source:|region\s*\d|prologues?\s+and)/i.test(
        line
      ) &&
      /:$/.test(line)
    ) {
      if (/\bmissions?\b/i.test(line)) missionSignals += 2;
      if (/\bacts?\b/i.test(line)) actSignals += 2;
      if (/\bchapters?\b/i.test(line)) chapterSignals += 2;
      continue;
    }
    if (/^(?:here(?:'s| is)|sure[,!]|below is|notes?:|sources?:|learn more)/i.test(line)) {
      continue;
    }

    const hadListMarker =
      /^(?:\d{1,3}[.):\-]\s+|[-*•+]\s+|(?:chapter|mission|act|episode|part|stage|milestone)\s+\d+)/i.test(
        line
      );

    if (/\b(?:mission|quest)\b/i.test(line)) missionSignals += 1;
    else if (/\b(?:act|prologue|epilogue)\b/i.test(line)) actSignals += 1;
    else if (/\b(?:boss|milestone)\b/i.test(line)) milestoneSignals += 1;
    else if (/\b(?:chapter|episode|stage)\b/i.test(line)) chapterSignals += 1;

    // Strip numbering & bullet prefixes
    line = line
      .replace(/^[-*•+]\s+/, '')
      .replace(/^\d{1,3}\s*[.)\-–—:]\s+/, '')
      .replace(
        /^(?:chapter|mission|act|episode|part|stage)\s+(?:\d{1,3}|[IVX]+)\s*[:.\-–—]\s*/i,
        ''
      )
      .trim();

    // Strip trailing parenthetical blurbs only if very long or region/level notes cleanly kept short
    line = line.replace(/\s*\(optional\)\s*$/i, '').trim();

    if (!line || line.length < 2) continue;
    // Skip trailing category headers ending cleanly with ':'
    if (/:$/.test(line) && line.length < 48) continue;
    // Skip paragraph explanations unless explicitly numbered
    if (!hadListMarker && line.length > 90) continue;
    if (line.length > 120) {
      line = line.slice(0, 117).trim() + '…';
    }

    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chapters.push(line);
    if (chapters.length >= 120) break;
  }

  let detectedUnit: ChapterUnit = 'chapters';
  if (missionSignals > chapterSignals && missionSignals >= actSignals && missionSignals >= milestoneSignals) {
    detectedUnit = 'missions';
  } else if (actSignals > chapterSignals && actSignals > missionSignals && chapters.length <= 10) {
    detectedUnit = 'acts';
  } else if (milestoneSignals > chapterSignals && milestoneSignals > missionSignals) {
    detectedUnit = 'milestones';
  }

  return { chapters, detectedUnit };
}
