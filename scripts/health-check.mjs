import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const baseUrlArg = args.find((a) => a.startsWith('--base-url='));
const baseUrl = (baseUrlArg ? baseUrlArg.slice('--base-url='.length) : 'https://cue-three-theta.vercel.app').replace(
  /\/+$/,
  ''
);
const writeMarkdown = args.includes('--markdown');
const UA = 'CueHealthBot/1.0 (+https://cue-three-theta.vercel.app)';

const results = [];
let fatalFailures = 0;

function record(suite, name, ok, detail) {
  results.push({ suite, name, ok, detail });
  if (!ok) fatalFailures += 1;
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] [${suite}] ${name} — ${detail}`);
}

async function fetchJson(url, opts) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, ...(opts?.headers || {}) },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function runApiEndpointSuite() {
  try {
    const health = await fetchJson(`${baseUrl}/api/health`);
    const ok = Boolean(health && health.onlineCount >= 4);
    record(
      'API',
      '/api/health',
      ok,
      `${health.status} (${health.onlineCount}/${health.totalCount} online in ${health.overallLatencyMs}ms)`
    );
  } catch (err) {
    record('API', '/api/health', false, err instanceof Error ? err.message : 'Request failed');
  }

  for (const mode of ['trending', 'anticipated', 'popular']) {
    try {
      const data = await fetchJson(`${baseUrl}/api/trending-games?mode=${mode}&limit=6`);
      const count = Array.isArray(data.items) ? data.items.length : 0;
      const valid = count > 0 && Boolean(data.items[0]?.title && data.items[0]?.posterUrl);
      record('API', `/api/trending-games?mode=${mode}`, valid, `${count} items (e.g. ${data.items?.[0]?.title || 'none'})`);
    } catch (err) {
      record('API', `/api/trending-games?mode=${mode}`, false, err instanceof Error ? err.message : 'Failed');
    }
  }

  try {
    const comic = await fetchJson(`${baseUrl}/api/comic-series?q=${encodeURIComponent('Amazing Spider-Man 2025')}`);
    const count = Array.isArray(comic.items) ? comic.items.length : 0;
    const has2025 = Boolean(
      comic.items?.some(
        (x) => /amazing spider-man/i.test(x.title || '') && String(x.startYear ?? x.year) === '2025'
      )
    );
    record('API', '/api/comic-series?q=Amazing+Spider-Man+2025', count > 0 && has2025, `${count} series matched`);
  } catch (err) {
    record('API', '/api/comic-series', false, err instanceof Error ? err.message : 'Failed');
  }
}

async function runRegressionGuards() {
  const isbns = [
    { isbn: '9781401207526', expectTitle: /batman/i },
    { isbn: '9780441172719', expectTitle: /dune/i },
    { isbn: '9781302934071', expectTitle: /annihilation/i },
  ];

  for (const { isbn, expectTitle } of isbns) {
    try {
      const data = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      const entry = data[`ISBN:${isbn}`];
      const title = entry?.title || '';
      record('ISBN', `ISBN ${isbn}`, Boolean(title && expectTitle.test(title)), title || 'Missing');
    } catch (err) {
      record('ISBN', `ISBN ${isbn}`, false, err instanceof Error ? err.message : 'Failed');
    }
  }

  // Ensure Marvel Fandom returns real Annihilation Vol 1 Cover A and not Wonder Woman / Solicit leak
  try {
    const mw = await fetchJson(
      'https://marvel.fandom.com/api.php?action=query&titles=Annihilation_Vol_1_1|Annihilation_Vol_1_2|Annihilation_Vol_1_3&prop=revisions&rvprop=content&rvslots=main&rvsection=0&format=json'
    );
    const pages = Object.values(mw.query?.pages || {});
    const validPages = pages.filter((p) => p.missing === undefined);
    const texts = validPages.map((p) => p.revisions?.[0]?.slots?.main?.['*'] || '');
    const leaked = texts.some((t) => /wonder woman/i.test(t));
    record(
      'Comics',
      'Marvel Fandom Annihilation Vol 1 1..3',
      validPages.length === 3 && !leaked,
      `${validPages.length}/3 issues resolved cleanly`
    );
  } catch (err) {
    record('Comics', 'Marvel Fandom Annihilation Vol 1 1..3', false, err instanceof Error ? err.message : 'Failed');
  }
}

async function checkUrlStatus(url) {
  const tryFetch = async (method) => {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    return res.status;
  };
  try {
    let status = await tryFetch('HEAD');
    if (status === 405 || status === 403 || status === 400) {
      status = await tryFetch('GET');
    }
    return status;
  } catch {
    return 0;
  }
}

async function runCuratedLinkRotAudit() {
  const urlSet = new Set();
  const root = process.cwd();

  const seedJsonPath = path.join(root, 'src', 'data', 'generatedMedia.json');
  if (fs.existsSync(seedJsonPath)) {
    const data = JSON.parse(fs.readFileSync(seedJsonPath, 'utf8').replace(/^\uFEFF/, ''));
    for (const s of data.shows || []) {
      if (s.posterUrl) urlSet.add(s.posterUrl);
      if (s.backdropUrl) urlSet.add(s.backdropUrl);
    }
    for (const m of data.movies || []) {
      if (m.posterUrl) urlSet.add(m.posterUrl);
      if (m.backdropUrl) urlSet.add(m.backdropUrl);
    }
    for (const r of data.readItems || []) {
      if (r.coverUrl) urlSet.add(r.coverUrl);
      if (r.backdropUrl) urlSet.add(r.backdropUrl);
    }
    for (const g of data.games || []) {
      if (g.coverUrl) urlSet.add(g.coverUrl);
      if (g.backdropUrl) urlSet.add(g.backdropUrl);
    }
  }

  const editionsPath = path.join(root, 'src', 'utils', 'editions.ts');
  if (fs.existsSync(editionsPath)) {
    const txt = fs.readFileSync(editionsPath, 'utf8');
    const matches = txt.match(/https:\/\/[^\s'"`)]+/g) || [];
    for (const u of matches) urlSet.add(u);
  }

  const urls = [...urlSet].filter((u) => /^https?:\/\//i.test(u));
  const broken = [];
  const concurrency = 10;

  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    const statuses = await Promise.all(chunk.map((u) => checkUrlStatus(u)));
    statuses.forEach((st, idx) => {
      if (st === 404 || st === 410) {
        broken.push({ url: chunk[idx], status: st });
      }
    });
  }

  record(
    'Links',
    'Curated cover & poster link-rot audit',
    broken.length === 0,
    broken.length === 0
      ? `${urls.length}/${urls.length} curated URLs healthy`
      : `${broken.length} dead (404/410) of ${urls.length}: ${broken.slice(0, 5).map((b) => `${b.status} ${b.url}`).join('; ')}`
  );
}

await runApiEndpointSuite();
await runRegressionGuards();
await runCuratedLinkRotAudit();

if (writeMarkdown) {
  const lines = [
    `## Cue Automated Health Report (${new Date().toISOString()})`,
    '',
    `- Target: \`${baseUrl}\``,
    `- Passed: **${results.filter((r) => r.ok).length}/${results.length}**`,
    '',
    '| Status | Suite | Check | Detail |',
    '| --- | --- | --- | --- |',
    ...results.map(
      (r) => `| ${r.ok ? 'PASS' : '**FAIL**'} | ${r.suite} | \`${r.name}\` | ${r.detail} |`
    ),
    '',
  ];
  fs.writeFileSync(path.join(process.cwd(), 'health-report.md'), lines.join('\n'), 'utf8');
}

if (fatalFailures > 0) {
  console.error(`\nHealth check failed (${fatalFailures} issues found).`);
  process.exit(1);
}

console.log('\nAll Cue health checks passed.');
