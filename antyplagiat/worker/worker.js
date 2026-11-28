// Antyplagiat – serwer pośredniczący dla Cloudflare Workers.
//
// Dwa adresy:
//   GET /search?q=...   – wyszukuje frazę w Brave Search API (klucz zostaje na serwerze)
//   GET /fetch?url=...  – pobiera stronę i zwraca sam tekst (przeglądarka nie może tego
//                         zrobić bezpośrednio z powodu blokady CORS)
//
// Ustawienia w panelu Cloudflare (Settings → Variables and Secrets):
//   BRAVE_API_KEY    (Secret)  – klucz z https://api-dashboard.search.brave.com
//   ALLOWED_ORIGINS  (Text)    – np. "https://chiniak.github.io" (kilka po przecinku)

const MAX_PAGE_BYTES = 1_500_000; // pobieramy maks. ~1,5 MB HTML
const MAX_TEXT_CHARS = 200_000;   // zwracamy maks. 200 tys. znaków tekstu
const FETCH_TIMEOUT_MS = 8000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://chiniak.github.io')
      .split(',').map(s => s.trim()).filter(Boolean);
    const originOk = allowed.includes('*') || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk ? (allowed.includes('*') ? '*' : origin) : 'null',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });

    // Chroni przed używaniem serwera (i Twojego limitu Brave) przez obce strony.
    if (!originOk) return json({ error: 'Ta strona nie ma dostępu do serwera (sprawdź ALLOWED_ORIGINS).' }, 403);
    if (request.method !== 'GET') return json({ error: 'Dozwolone tylko GET.' }, 405);

    const url = new URL(request.url);
    try {
      if (url.pathname === '/search') return json(await search(url.searchParams.get('q'), env));
      if (url.pathname === '/fetch') return json(await fetchText(url.searchParams.get('url')));
      if (url.pathname === '/' || url.pathname === '/ping') return json({ ok: true, brave: !!env.BRAVE_API_KEY });
      return json({ error: 'Nieznany adres.' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, e.status || 500);
    }
  },
};

function fail(message, status) { const e = new Error(message); e.status = status; return e; }

async function search(q, env) {
  if (!env.BRAVE_API_KEY) throw fail('Brak klucza BRAVE_API_KEY w ustawieniach Workera.', 500);
  q = (q || '').trim();
  if (!q || q.length > 400) throw fail('Puste lub zbyt długie zapytanie.', 400);

  const api = new URL('https://api.search.brave.com/res/v1/web/search');
  api.searchParams.set('q', q);
  api.searchParams.set('count', '10');
  api.searchParams.set('safesearch', 'off');
  api.searchParams.set('text_decorations', 'false');

  const r = await fetch(api, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY },
  });
  if (r.status === 429) throw fail('Przekroczony limit zapytań Brave (spróbuj za chwilę).', 429);
  if (r.status === 401 || r.status === 403) throw fail('Brave odrzucił klucz API.', 502);
  if (!r.ok) throw fail(`Brave zwrócił błąd ${r.status}.`, 502);
  const data = await r.json();
  const results = ((data.web && data.web.results) || []).map(x => ({
    url: x.url, title: x.title || '', snippet: [x.description || '', ...(x.extra_snippets || [])].join(' '),
  }));
  return { results };
}

async function fetchText(target) {
  let u;
  try { u = new URL(target); } catch { throw fail('Niepoprawny adres strony.', 400); }
  if (!/^https?:$/.test(u.protocol)) throw fail('Dozwolone tylko adresy http(s).', 400);
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) {
    throw fail('Adresy lokalne są zablokowane.', 400);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(u.toString(), {
      signal: ctrl.signal, redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AntyplagiatBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'pl,en;q=0.8',
      },
    });
  } catch (e) {
    throw fail(ctrl.signal.aborted ? 'Strona nie odpowiedziała na czas.' : 'Nie udało się pobrać strony.', 502);
  } finally { clearTimeout(t); }
  if (!r.ok) throw fail(`Strona zwróciła błąd ${r.status}.`, 502);

  const type = (r.headers.get('Content-Type') || '').toLowerCase();
  if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw fail(`Nieobsługiwany typ pliku (${type.split(';')[0] || 'nieznany'}).`, 415);

  const bytes = await readLimited(r.body, MAX_PAGE_BYTES);
  const charset = (type.match(/charset=([\w-]+)/) || [])[1] || sniffCharset(bytes) || 'utf-8';
  let raw;
  try { raw = new TextDecoder(charset).decode(bytes); } catch { raw = new TextDecoder('utf-8').decode(bytes); }

  const isHtml = !type.includes('text/plain');
  const title = isHtml ? decodeEntities(((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim()) : '';
  const text = (isHtml ? htmlToText(raw) : raw).slice(0, MAX_TEXT_CHARS);
  return { url: r.url || u.toString(), title, text };
}

async function readLimited(stream, max) {
  const reader = stream.getReader();
  const chunks = []; let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.length;
  }
  reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(size, max)); let off = 0;
  for (const c of chunks) { const part = c.subarray(0, out.length - off); out.set(part, off); off += part.length; if (off >= out.length) break; }
  return out;
}

function sniffCharset(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  return (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
}

function htmlToText(html) {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)(?=[\s>])[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(nav|footer|header|aside|form)(?=[\s>])[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', oacute: 'ó', Oacute: 'Ó', ndash: '–', mdash: '—', bdquo: '„', rdquo: '”', ldquo: '“', hellip: '…' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
    return named[e] ?? m;
  });
}
