import fs from 'node:fs/promises';
import path from 'node:path';

const BOOKS = [
  {
    id: 'dune-book',
    title: 'Dune',
    creator: 'Frank Herbert',
    year: 1965,
    totalUnits: 48,
    genres: ['Sci-Fi', 'Epic'],
    rating: 4.7,
    wiki: 'Dune_(novel)',
    olQuery: 'Dune Frank Herbert',
  },
  {
    id: 'project-hail-mary',
    title: 'Project Hail Mary',
    creator: 'Andy Weir',
    year: 2021,
    totalUnits: 30,
    genres: ['Sci-Fi', 'Space'],
    rating: 4.8,
    wiki: 'Project_Hail_Mary',
    olQuery: 'Project Hail Mary Andy Weir',
  },
  {
    id: 'three-body-problem',
    title: 'The Three-Body Problem',
    creator: 'Cixin Liu',
    year: 2008,
    totalUnits: 35,
    genres: ['Sci-Fi', 'Mystery'],
    rating: 4.5,
    wiki: 'The_Three-Body_Problem_(novel)',
    olQuery: 'Three-Body Problem Cixin Liu',
  },
  {
    id: 'piranesi',
    title: 'Piranesi',
    creator: 'Susanna Clarke',
    year: 2020,
    totalUnits: 18,
    genres: ['Fantasy', 'Mystery'],
    rating: 4.6,
    wiki: 'Piranesi_(novel)',
    olQuery: 'Piranesi Susanna Clarke',
  },
];

const MANGA = [
  {
    id: 'berserk',
    title: 'Berserk',
    creator: 'Kentaro Miura',
    year: 1989,
    totalUnits: 376,
    genres: ['Dark Fantasy', 'Action'],
    rating: 4.9,
    anilistId: 30002,
    wiki: 'Berserk_(manga)',
  },
  {
    id: 'vagabond',
    title: 'Vagabond',
    creator: 'Takehiko Inoue',
    year: 1998,
    totalUnits: 327,
    genres: ['Historical', 'Drama'],
    rating: 4.9,
    anilistId: 30656,
    wiki: 'Vagabond_(manga)',
  },
  {
    id: 'chainsaw-man',
    title: 'Chainsaw Man',
    creator: 'Tatsuki Fujimoto',
    year: 2018,
    totalUnits: 185,
    genres: ['Action', 'Supernatural'],
    rating: 4.6,
    anilistId: 105778,
    wiki: 'Chainsaw_Man',
  },
  {
    id: 'one-piece',
    title: 'One Piece',
    creator: 'Eiichiro Oda',
    year: 1997,
    totalUnits: 1130,
    genres: ['Adventure', 'Shonen'],
    rating: 4.9,
    anilistId: 30013,
    wiki: 'One_Piece',
  },
];

const COMICS = [
  {
    id: 'watchmen',
    title: 'Watchmen',
    creator: 'Alan Moore & Dave Gibbons',
    year: 1986,
    totalUnits: 12,
    genres: ['Graphic Novel', 'Superhero'],
    rating: 4.8,
    wiki: 'Watchmen',
    olQuery: 'Watchmen Alan Moore',
  },
  {
    id: 'saga',
    title: 'Saga',
    creator: 'Brian K. Vaughan & Fiona Staples',
    year: 2012,
    totalUnits: 72,
    genres: ['Sci-Fi', 'Space Opera'],
    rating: 4.7,
    wiki: 'Saga_(comics)',
    olQuery: 'Saga Brian K Vaughan',
  },
  {
    id: 'invincible-comic',
    title: 'Invincible',
    creator: 'Robert Kirkman & Ryan Ottley',
    year: 2003,
    totalUnits: 144,
    genres: ['Superhero', 'Action'],
    rating: 4.7,
    wiki: 'Invincible_(comics)',
    olQuery: 'Invincible Compendium Robert Kirkman',
  },
  {
    id: 'batman-year-one',
    title: 'Batman: Year One',
    creator: 'Frank Miller & David Mazzucchelli',
    year: 1987,
    totalUnits: 4,
    genres: ['Noir', 'Crime'],
    rating: 4.7,
    wiki: 'Batman:_Year_One',
    olQuery: 'Batman Year One Frank Miller',
  },
];

const GAMES = [
  {
    id: 'elden-ring',
    title: 'Elden Ring',
    developer: 'FromSoftware',
    year: 2022,
    genres: ['Action RPG', 'Soulslike'],
    rating: 4.9,
    steamAppId: 1245620,
    platforms: ['PS5', 'PC', 'Xbox', 'Steam Deck'],
    wiki: 'Elden_Ring',
  },
  {
    id: 'baldurs-gate-3',
    title: "Baldur's Gate 3",
    developer: 'Larian Studios',
    year: 2023,
    genres: ['CRPG', 'Fantasy'],
    rating: 4.9,
    steamAppId: 1086940,
    platforms: ['PC', 'PS5', 'Xbox', 'Steam Deck'],
    wiki: "Baldur's_Gate_3",
  },
  {
    id: 'hades-ii',
    title: 'Hades II',
    developer: 'Supergiant Games',
    year: 2025,
    genres: ['Roguelike', 'Action'],
    rating: 4.8,
    steamAppId: 1145350,
    platforms: ['Steam Deck', 'PC', 'Switch'],
    wiki: 'Hades_II',
  },
  {
    id: 'cyberpunk-2077',
    title: 'Cyberpunk 2077',
    developer: 'CD PROJEKT RED',
    year: 2020,
    genres: ['RPG', 'Cyberpunk'],
    rating: 4.6,
    steamAppId: 1091500,
    platforms: ['PC', 'PS5', 'Xbox', 'Steam Deck'],
    wiki: 'Cyberpunk_2077',
  },
  {
    id: 'hollow-knight',
    title: 'Hollow Knight',
    developer: 'Team Cherry',
    year: 2017,
    genres: ['Metroidvania', 'Indie'],
    rating: 4.9,
    steamAppId: 367520,
    platforms: ['Switch', 'PC', 'PS5', 'Steam Deck'],
    wiki: 'Hollow_Knight',
  },
  {
    id: 'rdr2',
    title: 'Red Dead Redemption 2',
    developer: 'Rockstar Games',
    year: 2018,
    genres: ['Action-Adventure', 'Western'],
    rating: 4.9,
    steamAppId: 1174180,
    platforms: ['PS5', 'PC', 'Xbox'],
    wiki: 'Red_Dead_Redemption_2',
  },
  {
    id: 'witcher-3',
    title: 'The Witcher 3: Wild Hunt',
    developer: 'CD PROJEKT RED',
    year: 2015,
    genres: ['Action RPG', 'Fantasy'],
    rating: 4.9,
    steamAppId: 292030,
    platforms: ['PC', 'PS5', 'Switch', 'Xbox'],
    wiki: 'The_Witcher_3:_Wild_Hunt',
  },
  {
    id: 'sekiro',
    title: 'Sekiro: Shadows Die Twice',
    developer: 'FromSoftware',
    year: 2019,
    genres: ['Action-Adventure', 'Soulslike'],
    rating: 4.8,
    steamAppId: 814380,
    platforms: ['PC', 'PS5', 'Xbox'],
    wiki: 'Sekiro:_Shadows_Die_Twice',
  },
  {
    id: 'metaphor-refantazio',
    title: 'Metaphor: ReFantazio',
    developer: 'Studio Zero / Atlus',
    year: 2024,
    genres: ['JRPG', 'Fantasy'],
    rating: 4.8,
    steamAppId: 2679460,
    platforms: ['PS5', 'PC', 'Xbox'],
    wiki: 'Metaphor:_ReFantazio',
  },
  {
    id: 'persona-5-royal',
    title: 'Persona 5 Royal',
    developer: 'P-Studio / Atlus',
    year: 2020,
    genres: ['JRPG', 'Social Sim'],
    rating: 4.9,
    steamAppId: 1687950,
    platforms: ['Switch', 'PS5', 'PC', 'Xbox'],
    wiki: 'Persona_5',
  },
  {
    id: 'expedition-33',
    title: 'Clair Obscur: Expedition 33',
    developer: 'Sandfall Interactive',
    year: 2025,
    genres: ['Turn-Based RPG', 'Fantasy'],
    rating: 4.9,
    steamAppId: 1903340,
    platforms: ['PC', 'PS5', 'Xbox'],
    wiki: 'Clair_Obscur:_Expedition_33',
  },
  {
    id: 'zelda-totk',
    title: 'The Legend of Zelda: Tears of the Kingdom',
    developer: 'Nintendo EPD',
    year: 2023,
    genres: ['Action-Adventure', 'Open World'],
    rating: 4.9,
    platforms: ['Switch'],
    wiki: 'The_Legend_of_Zelda:_Tears_of_the_Kingdom',
  },
];

const UA = { 'User-Agent': 'CueAllMediaSeed/1.0 (https://localhost)' };

async function checkImageOk(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'HEAD', headers: UA });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchWikiSummary(slug) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
      headers: UA,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchOpenLibraryCover(query) {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`,
      { headers: UA }
    );
    if (!res.ok) return '';
    const data = await res.json();
    const doc = (data.docs || []).find((d) => d.cover_i);
    return doc ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '';
  } catch {
    return '';
  }
}

async function fetchAniListManga(anilistId) {
  try {
    const query = `query($id:Int){Media(id:$id,type:MANGA){id title{english romaji} coverImage{extraLarge large} bannerImage chapters description(asHtml:false) genres averageScore}}`;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...UA },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.Media || null;
  } catch {
    return null;
  }
}

async function main() {
  const existingPath = path.resolve('src/data/generatedMedia.json');
  const existing = JSON.parse(await fs.readFile(existingPath, 'utf8'));

  const readItems = [];

  // Books
  for (const b of BOOKS) {
    process.stdout.write(`Book: ${b.title}... `);
    const wiki = await fetchWikiSummary(b.wiki);
    const olCover = await fetchOpenLibraryCover(b.olQuery);
    const wikiCover = wiki?.originalimage?.source || wiki?.thumbnail?.source || '';
    const coverUrl = (await checkImageOk(olCover)) ? olCover : wikiCover;
    readItems.push({
      id: b.id,
      format: 'novel',
      unit: 'chapters',
      title: b.title,
      creator: b.creator,
      year: b.year,
      totalUnits: b.totalUnits,
      genres: b.genres,
      rating: b.rating,
      coverUrl,
      backdropUrl: coverUrl,
      overview: wiki?.extract || `${b.title} by ${b.creator}.`,
    });
    console.log(`OK (${Boolean(coverUrl)})`);
  }

  // Manga
  for (const m of MANGA) {
    process.stdout.write(`Manga: ${m.title}... `);
    const al = await fetchAniListManga(m.anilistId);
    const wiki = await fetchWikiSummary(m.wiki);
    const coverUrl =
      al?.coverImage?.extraLarge ||
      al?.coverImage?.large ||
      wiki?.originalimage?.source ||
      wiki?.thumbnail?.source ||
      '';
    const backdropUrl = al?.bannerImage || coverUrl;
    readItems.push({
      id: m.id,
      format: 'manga',
      unit: 'chapters',
      title: m.title,
      creator: m.creator,
      year: m.year,
      totalUnits: al?.chapters || m.totalUnits,
      genres: al?.genres?.length ? al.genres.slice(0, 3) : m.genres,
      rating: m.rating,
      coverUrl,
      backdropUrl,
      overview:
        (al?.description || '').replace(/\n+/g, ' ').trim() ||
        wiki?.extract ||
        `${m.title} manga by ${m.creator}.`,
    });
    console.log(`OK (${Boolean(coverUrl)})`);
  }

  // Comics
  for (const c of COMICS) {
    process.stdout.write(`Comic: ${c.title}... `);
    const wiki = await fetchWikiSummary(c.wiki);
    const olCover = await fetchOpenLibraryCover(c.olQuery);
    const wikiCover = wiki?.originalimage?.source || wiki?.thumbnail?.source || '';
    const coverUrl = (await checkImageOk(wikiCover)) ? wikiCover : olCover;
    readItems.push({
      id: c.id,
      format: 'comic',
      unit: 'issues',
      title: c.title,
      creator: c.creator,
      year: c.year,
      totalUnits: c.totalUnits,
      genres: c.genres,
      rating: c.rating,
      coverUrl,
      backdropUrl: coverUrl,
      overview: wiki?.extract || `${c.title} by ${c.creator}.`,
    });
    console.log(`OK (${Boolean(coverUrl)})`);
  }

  // Video Games
  const games = [];
  for (const g of GAMES) {
    process.stdout.write(`Game: ${g.title}... `);
    const wiki = await fetchWikiSummary(g.wiki);
    const wikiImg = wiki?.originalimage?.source || wiki?.thumbnail?.source || '';
    let coverUrl = wikiImg;
    let backdropUrl = wikiImg;

    if (g.steamAppId) {
      const steamVert = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.steamAppId}/library_600x900_2x.jpg`;
      const steamVert1x = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.steamAppId}/library_600x900.jpg`;
      const steamHeader = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.steamAppId}/header.jpg`;
      if (await checkImageOk(steamVert)) coverUrl = steamVert;
      else if (await checkImageOk(steamVert1x)) coverUrl = steamVert1x;
      if (await checkImageOk(steamHeader)) backdropUrl = steamHeader;
    }

    games.push({
      id: g.id,
      steamAppId: g.steamAppId,
      title: g.title,
      developer: g.developer,
      year: g.year,
      genres: g.genres,
      rating: g.rating,
      platforms: g.platforms,
      coverUrl: coverUrl || backdropUrl,
      backdropUrl: backdropUrl || coverUrl,
      overview: wiki?.extract || `${g.title} developed by ${g.developer}.`,
    });
    console.log(`OK (cover=${Boolean(coverUrl)}, header=${Boolean(backdropUrl)})`);
  }

  const nextData = {
    shows: existing.shows,
    movies: existing.movies,
    readItems,
    games,
  };
  await fs.writeFile(existingPath, JSON.stringify(nextData, null, 2), 'utf8');
  console.log(
    `\nSaved ${nextData.shows.length} shows, ${nextData.movies.length} movies, ${readItems.length} readItems, ${games.length} games.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
