# Cue — Watch · Read · Play

Cue is a private, mobile-first media journal and progress tracker for **Shows & Movies**, **Books, Manga & Comics**, and **Video Games**.

**Live App:** [cue-three-theta.vercel.app](https://cue-three-theta.vercel.app)

---

## Core Architecture: Atomic Units & Smart Containers

Cue separates media tracking into two layers so you never double-log progress:

- **Atomic Units (The Bricks):** Single TV/anime episodes, comic issues, book/manga chapters, movies, and game story chapters/missions.
- **Smart Containers (The Buckets):** Linear containers (TV seasons, manga volumes, game campaigns) and overlapping relational containers (Comic TPBs, Hardcovers, Omnibuses, Compendiums, Movie Collections, and custom Reading Orders/Events).
- **Automatic Bi-Directional Sync & Auto-Populated Containers:** Logging individual comic issues (`#1–6`) automatically advances and checks off any TPBs or Omnibuses containing those issues — and checking off a collected edition retroactively marks its underlying issues read across your library. Loading an Omnibus or collected edition matches exact Fandom collection metadata & official cover art, immediately auto-populates its constituent parent series right inside **Synced Smart Containers** (ranked by relevance, shared-issue coverage, and series popularity, with a collapsible *"Additional containers & series"* overflow section for large multi-series editions), and reconciles previewed series progress with stored atomic read units.
- **Catch-Up Prompt Sheet:** Marking a non-adjacent episode, chapter, or issue prompts to catch up all skipped prior atoms (with a per-title *"Never ask"* toggle).
- **Finished Date Timeline Sync & Multi-Run History:** Edit finished dates at every level — individual atoms (episodes, comic issues, book/manga chapters, game chapters), TV seasons, full titles, and collections/series/custom lists — with automatic cross-container issue date sync and multi-run history (`completedRuns`) reflected directly in **Your Days**, **16-Week Pulse**, **When You Engage**, and **Hall of Fame**.
- **Automatic Rating Rollups with Manual Override:** Rating individual atoms automatically computes and applies average ratings upward to seasons, parent titles, overlapping comic containers, and custom/curated collections (`Auto avg`), while preserving any manual star override (`manual`) with one-tap reset to average.
- **Resilient Multi-API Adapters & Offline Queueing:** All external providers are normalized into unified Cue schemas with `Promise.allSettled` fault isolation, strict timeouts across client & serverless calls (`src/utils/safeFetch.ts`), per-host `429` backoff, and an **Offline ISBN Queue** (`pendingIsbnScans`) that saves shelf scans offline and auto-syncs when online.

---

## Key Features

- **Cue Queue (`Up Next`) & Resilient History Navigation:** Unfinished released episodes, chapters, comic issues, and active games in one clean queue — automatically filtering out unreleased TBA or future solicitations while preserving dateless classic shows, paired with URL-hashed browser history synchronization and preserved **Search** queries, live results, expanded rails, and scroll positions across Back navigation.
- **Cue Mind (`Continue` & `Discover`):** Contextual taste engine hidden cleanly behind Journal onboarding until you have logged at least 5 entries, helping you either resume momentum (`Smart`, `Quick`, `Deep`, `Finish`) or discover trending runs and series.
- **Watch (TV, Anime & Movies):** Unified Watch view powered by TMDB and AniList/AniZip, including episode stills, per-episode ratings, rewatches, "Where to watch" providers, and subtle Blu-ray / 4K / DVD collection tracking.
- **Read (Novels, Manga, Comics & Omnibuses):** Open Library, MangaDex, MangaUpdates, AniList, Google Books, and cross-publisher comic issue hydration covering **Marvel, DC, Image, Dark Horse Comics, IDW Publishing, BOOM! Studios**, optional universal **Comic Vine** (`COMICVINE_API_KEY`), live **MangaUpdates + MangaDex chapter count resolution** for ongoing series (no stale 80-chapter fallback), user-assisted **"Fix info & count"** tools (1-tap live refresh, Google/web snippet count parser, `+1`/`+10` bump, and locked cover/title/count overrides across Read & Shows), live camera **ISBN Barcode Scanner**, custom indie comic run creator, and subtle **Collecting** (`Owned` / `Wishlist` tracking at single-issue, edition, and book/series levels with variant/shelf notes and cross-container atomic sync).
- **Play (Games):** IGDB & Steam-backed game library with automatic Steam/IGDB enrichment for imported stubs (`api/igdb.ts?action=enrich`), story chapter/mission tracking, storefront/platform ownership tracking (`Steam`, `Epic Games`, `GOG`, `Itch.io`, physical consoles), one-tap **Suggest chapters & missions** (via curated catalog, Wikipedia/web lookup, or Google AI Mode copy-and-paste parser), and **"Fix info & art"** for auto-matching or editing covers, developers, overviews, and chapters.
- **Simple & Advanced Detail Modes:** Switch seamlessly between distraction-free quick logging (with a **Grouped / All** toggle for long chapter/issue lists) and deep per-unit stats, finished-date editing, ratings histograms, timelines, and detailed collection logs (format, purchase date, price, live `$/min` / `$/page` / `$/hr`, owner, includes, and notes).
- **Journal, Analytics, Recent Entries & Dedicated Library:** Unified Journal with customizable uploaded or URL **profile picture & cover banner**, a single top-aligned **Recent Entries** activity rail across Watch, Read, and Play linked to a dedicated full **Library** page (`All | Watch | Read | Play` tabs with status/collection filters and bulk actions), 16-Week Pulse (`Logs` / `Time`), Your Days 16x7 activity grid, When You Engage matrix, Hall of Fame records, backlog time forecast, Taste DNA, an Advanced **My Collection** ledger with inline add/edit support across Watch, Read, and Play, and a **Year-in-Review / 2026 Wrapped** generator with PNG card export.
- **Event Reading Orders & Bulk Edit:** Chronological issue-level comic Reading Orders (e.g., *House of X / Powers of X*, *Secret Wars (2015)*, *Annihilation*) with reordering and live atomic sync, plus multi-select **Bulk Edit** across Watch, Read, and Play.
- **Smart Import, Persistent Undo & Human-Readable Exports:** Export human-readable **Library CSV** (Watch, Read & Play spreadsheets), **Comics CSV** (`Publisher Name`, `Series Name`, `Full Title`, per-issue ownership & ratings), **Finished Log TXT**, or lossless Cue JSON backups; safely import IMDb CSVs, Letterboxd CSVs, Goodreads CSVs, League of Comic Geeks CSVs, Trakt/TV Time JSONs, Cue CSV/JSON backups, or plain-text `.txt` finished logs with 1-tap preview type cycling, edition- & atom-aware comic deduplication (`DC Compact`, `TP`/`HC`/`Omnibus`, live atomic issue hydration), and persistent **Undo Recent Import** history (surgical rollback saved across reloads in Settings and Smart Import), plus optional no-account cross-device cloud sync via pairing code or QR code.

---

## Serverless API Routes (`api/`)

| File | Purpose |
| --- | --- |
| `api/tmdb.ts` | TMDB proxy for shows, movies, trending rails, and watch providers |
| `api/igdb.ts` | IGDB / Twitch game search, discovery feeds, and IGDB + Steam stub enrichment (`action=enrich`) |
| `api/trending-games.ts` | Trending & recent game discovery feed |
| `api/comic-series.ts` | Comic series, Dark Horse / IDW / BOOM! / Fandom / optional Comic Vine runs, omnibuses & single issues |
| `api/manga-chapters.ts` | Live MangaUpdates + MangaDex chapter count & publication status resolver for ongoing manga |
| `api/game-chapters.ts` | Story chapter & mission lookup and web suggestion parser |
| `api/imdb-resolve.ts` | Batched IMDb title ID resolution for GDPR/CSV imports |
| `api/sync.ts` | No-account pairing-code cloud state sync |
| `api/health.ts` | Upstream API connectivity & latency check (surfaced in Settings) |

---

## Development

```bash
npm install
npm run dev
npm run build
```

Production builds run `tsc -b && vite build` and deploy to Vercel (`vercel --prod --yes`).
