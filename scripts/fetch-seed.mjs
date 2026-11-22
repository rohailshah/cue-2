import fs from 'node:fs/promises';
import path from 'node:path';

const SHOW_TARGETS = [
  { id: 'house-of-the-dragon', query: 'House of the Dragon', mediaType: 'tv' },
  { id: 'stranger-things', query: 'Stranger Things', mediaType: 'tv' },
  { id: 'the-boys', query: 'The Boys', mediaType: 'tv' },
  { id: 'the-bear', query: 'The Bear', mediaType: 'tv' },
  { id: 'severance', query: 'Severance', mediaType: 'tv' },
  { id: 'silo', query: 'Silo', mediaType: 'tv' },
  { id: 'friends', query: 'Friends', mediaType: 'tv' },
  { id: 'euphoria', query: 'Euphoria', mediaType: 'tv' },
  { id: 'the-white-lotus', query: 'The White Lotus', mediaType: 'tv' },
  { id: 'squid-game', query: 'Squid Game', mediaType: 'tv' },
  { id: 'strange-new-worlds', query: 'Star Trek: Strange New Worlds', mediaType: 'tv' },
  { id: 'king-of-the-hill', query: 'King of the Hill', mediaType: 'tv' },
  { id: 'breaking-bad', query: 'Breaking Bad', mediaType: 'tv' },
  { id: 'the-last-of-us', query: 'The Last of Us', mediaType: 'tv' },
  { id: 'attack-on-titan', query: 'Attack on Titan', mediaType: 'anime' },
  { id: 'solo-leveling', query: 'Solo Leveling', mediaType: 'anime' },
];

const MOVIE_TARGETS = [
  { id: 'sinners', query: 'Sinners Ryan Coogler', wiki: 'Sinners_(2025_film)', fallbackTitle: 'Sinners', fallbackYear: 2025, director: 'Ryan Coogler', genres: ['Horror', 'Thriller'], runtime: 137, rating: 8.1 },
  { id: 'f1', query: 'F1 The Movie', wiki: 'F1_(film)', fallbackTitle: 'F1', fallbackYear: 2025, director: 'Joseph Kosinski', genres: ['Action', 'Drama'], runtime: 155, rating: 7.9 },
  { id: 'avengers-endgame', query: 'Avengers Endgame', wiki: 'Avengers:_Endgame', fallbackTitle: 'Avengers: Endgame', fallbackYear: 2019, director: 'Anthony & Joe Russo', genres: ['Action', 'Sci-Fi'], runtime: 181, rating: 8.4 },
  { id: 'titanic', query: 'Titanic 1997', wiki: 'Titanic_(1997_film)', fallbackTitle: 'Titanic', fallbackYear: 1997, director: 'James Cameron', genres: ['Drama', 'Romance'], runtime: 194, rating: 7.9 },
  { id: 'dune-part-two', query: 'Dune Part Two', wiki: 'Dune:_Part_Two', fallbackTitle: 'Dune: Part Two', fallbackYear: 2024, director: 'Denis Villeneuve', genres: ['Sci-Fi', 'Adventure'], runtime: 166, rating: 8.5 },
  { id: 'oppenheimer', query: 'Oppenheimer Christopher Nolan', wiki: 'Oppenheimer_(film)', fallbackTitle: 'Oppenheimer', fallbackYear: 2023, director: 'Christopher Nolan', genres: ['Biography', 'Drama'], runtime: 180, rating: 8.3 },
  { id: 'interstellar', query: 'Interstellar', wiki: 'Interstellar_(film)', fallbackTitle: 'Interstellar', fallbackYear: 2014, director: 'Christopher Nolan', genres: ['Sci-Fi', 'Adventure'], runtime: 169, rating: 8.7 },
  { id: 'spider-verse', query: 'Spider-Man Across the Spider-Verse', wiki: 'Spider-Man:_Across_the_Spider-Verse', fallbackTitle: 'Spider-Man: Across the Spider-Verse', fallbackYear: 2023, director: 'Joaquim Dos Santos', genres: ['Animation', 'Action'], runtime: 140, rating: 8.6 },
  { id: 'eeaao', query: 'Everything Everywhere All at Once', wiki: 'Everything_Everywhere_All_at_Once', fallbackTitle: 'Everything Everywhere All at Once', fallbackYear: 2022, director: 'Daniel Kwan & Daniel Scheinert', genres: ['Sci-Fi', 'Comedy'], runtime: 139, rating: 7.8 },
  { id: 'parasite', query: 'Parasite Bong Joon Ho', wiki: 'Parasite_(2019_film)', fallbackTitle: 'Parasite', fallbackYear: 2019, director: 'Bong Joon-ho', genres: ['Thriller', 'Drama'], runtime: 132, rating: 8.5 },
  { id: 'the-batman', query: 'The Batman Matt Reeves', wiki: 'The_Batman_(film)', fallbackTitle: 'The Batman', fallbackYear: 2022, director: 'Matt Reeves', genres: ['Action', 'Crime'], runtime: 176, rating: 7.8 },
  { id: 'spirited-away', query: 'Spirited Away Hayao Miyazaki', wiki: 'Spirited_Away', fallbackTitle: 'Spirited Away', fallbackYear: 2001, director: 'Hayao Miyazaki', genres: ['Animation', 'Fantasy'], runtime: 125, rating: 8.6 },
  { id: 'avatar-way-of-water', query: 'Avatar The Way of Water', wiki: 'Avatar:_The_Way_of_Water', fallbackTitle: 'Avatar: The Way of Water', fallbackYear: 2022, director: 'James Cameron', genres: ['Sci-Fi', 'Adventure'], runtime: 192, rating: 7.5 },
  { id: 'blade-runner-2049', query: 'Blade Runner 2049', wiki: 'Blade_Runner_2049', fallbackTitle: 'Blade Runner 2049', fallbackYear: 2017, director: 'Denis Villeneuve', genres: ['Sci-Fi', 'Neo-Noir'], runtime: 164, rating: 8.0 },
];

const stripHtml = (html) => (html ? html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchShow(target) {
  const data = await fetchJson(
    `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(target.query)}&embed[]=episodes&embed[]=cast`
  );
  let backdropUrl = '';
  try {
    const imgs = await fetchJson(`https://api.tvmaze.com/shows/${data.id}/images`);
    const bg = imgs.find((i) => i.type === 'background') || imgs.find((i) => i.type === 'banner');
    backdropUrl = bg?.resolutions?.original?.url || bg?.resolutions?.medium?.url || '';
  } catch {
    // ignore image endpoint failures
  }

  const rawEpisodes = data._embedded?.episodes || [];
  const posterUrl = data.image?.original || data.image?.medium || '';
  const firstEpStill = rawEpisodes.find((e) => e.image?.original)?.image?.original || '';
  if (!backdropUrl) {
    backdropUrl = firstEpStill || posterUrl;
  }

  const seasonMap = new Map();
  for (const ep of rawEpisodes) {
    if (!ep.season || !ep.number) continue;
    if (!seasonMap.has(ep.season)) seasonMap.set(ep.season, []);
    seasonMap.get(ep.season).push({
      id: `${target.id}-s${ep.season}e${ep.number}`,
      season: ep.season,
      number: ep.number,
      title: ep.name || `Episode ${ep.number}`,
      airdate: ep.airdate || '',
      runtime: ep.runtime || data.averageRuntime || 45,
      stillUrl: ep.image?.medium || ep.image?.original || backdropUrl || posterUrl,
      overview: rawEpisodes.length > 80 ? '' : stripHtml(ep.summary),
    });
  }

  const seasons = Array.from(seasonMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([number, episodes]) => ({
      number,
      episodes: episodes.sort((a, b) => a.number - b.number),
    }));

  const seenCharIds = new Set();
  const cast = [];
  for (const c of data._embedded?.cast || []) {
    const cid = String(c.character?.id || c.person?.id || cast.length);
    if (seenCharIds.has(cid)) continue;
    seenCharIds.add(cid);
    cast.push({
      id: cid,
      actor: c.person?.name || 'Cast Member',
      character: c.character?.name || c.person?.name || 'Character',
      avatarUrl:
        c.character?.image?.medium ||
        c.person?.image?.medium ||
        c.character?.image?.original ||
        c.person?.image?.original ||
        '',
    });
    if (cast.length >= 8) break;
  }

  return {
    id: target.id,
    tvmazeId: data.id,
    title: data.name,
    year: data.premiered ? Number(data.premiered.slice(0, 4)) : 2020,
    genres: data.genres?.length ? data.genres : ['Drama'],
    rating: data.rating?.average || 8.2,
    mediaType: target.mediaType,
    posterUrl,
    backdropUrl,
    overview: stripHtml(data.summary),
    runtimeAvg: data.averageRuntime || 45,
    network: data.webChannel?.name || data.network?.name || 'Streaming',
    totalEpisodes: rawEpisodes.length || seasons.reduce((s, x) => s + x.episodes.length, 0),
    seasons,
    cast,
  };
}

async function fetchMovie(target) {
  let itunesHit = null;
  try {
    const search = await fetchJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(target.query)}&limit=20`
    );
    const matches = (search.results || []).filter((r) => {
      if (r.kind !== 'feature-movie' || !r.trackName) return false;
      const year = r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : 0;
      const yearClose = Math.abs(year - target.fallbackYear) <= 2;
      const titleMatch = r.trackName
        .toLowerCase()
        .includes(target.fallbackTitle.split(':')[0].toLowerCase());
      const notStage = !r.trackName.toLowerCase().includes('live on stage');
      return yearClose && titleMatch && notStage;
    });
    itunesHit = matches[0] || null;
  } catch {
    // ignore
  }

  let wikiSummary = null;
  try {
    wikiSummary = await fetchJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${target.wiki}`,
      { 'User-Agent': 'CueTrackerClone/1.0 (https://localhost)' }
    );
  } catch {
    // ignore
  }

  const itunesPoster = itunesHit?.artworkUrl100
    ? itunesHit.artworkUrl100.replace('100x100bb', '600x900bb')
    : '';
  const wikiPoster = wikiSummary?.originalimage?.source || wikiSummary?.thumbnail?.source || '';

  const posterUrl = itunesPoster || wikiPoster;
  const backdropUrl = wikiPoster || itunesPoster;

  return {
    id: target.id,
    itunesId: itunesHit?.trackId,
    title: itunesHit?.trackName || target.fallbackTitle,
    year: itunesHit?.releaseDate ? Number(itunesHit.releaseDate.slice(0, 4)) : target.fallbackYear,
    genres: itunesHit?.primaryGenreName ? [itunesHit.primaryGenreName, ...target.genres.filter((g) => g !== itunesHit.primaryGenreName)].slice(0, 2) : target.genres,
    rating: target.rating,
    runtime: itunesHit?.trackTimeMillis ? Math.round(itunesHit.trackTimeMillis / 60000) : target.runtime,
    director: itunesHit?.artistName || target.director,
    posterUrl,
    backdropUrl,
    overview: itunesHit?.longDescription || wikiSummary?.extract || `${target.fallbackTitle} (${target.fallbackYear}) directed by ${target.director}.`,
    releaseDate: itunesHit?.releaseDate ? itunesHit.releaseDate.slice(0, 10) : `${target.fallbackYear}-06-01`,
    cast: [],
  };
}

async function main() {
  const shows = [];
  for (const target of SHOW_TARGETS) {
    process.stdout.write(`Fetching show: ${target.query}... `);
    const s = await fetchShow(target);
    shows.push(s);
    console.log(`OK (${s.seasons.length} seasons, ${s.totalEpisodes} eps, poster: ${Boolean(s.posterUrl)})`);
    await sleep(180);
  }

  const movies = [];
  for (const target of MOVIE_TARGETS) {
    process.stdout.write(`Fetching movie: ${target.fallbackTitle}... `);
    const m = await fetchMovie(target);
    movies.push(m);
    console.log(`OK (${m.year}, poster: ${Boolean(m.posterUrl)})`);
    await sleep(180);
  }

  const outPath = path.resolve('src/data/generatedMedia.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ shows, movies }, null, 2), 'utf8');
  console.log(`\nWrote ${shows.length} shows & ${movies.length} movies to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
