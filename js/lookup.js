// Ücretsiz ve anahtarsız canlı bilgi kaynakları. İstekler doğrudan telefondan gider;
// hiçbiri hesap, anahtar ya da ödeme istemez.
//  - Hava durumu: Open-Meteo (open-meteo.com)
//  - Haberler, ilginç bilgiler ve ansiklopedik bilgi: Wikipedia
//  - Döviz kurları: Frankfurter (Avrupa Merkez Bankası referans kurları)
const TIMEOUT_MS = 8000;
const WIKI_API = 'https://en.wikipedia.org/w/api.php';

export const LOOKUP_KINDS = ['weather', 'news', 'wikipedia', 'currency'];
export const LOOKUP_LABELS = { weather: 'Hava durumu', news: 'Haberler', wikipedia: 'Wikipedia', currency: 'Döviz kuru' };

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    throw err.name === 'AbortError' ? new Error('timed out') : err;
  } finally {
    clearTimeout(timer);
  }
}

const clean = (text) => text.replace(/\s+/g, ' ').trim();
const shorten = (text, max) => (text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')}…`);
const bullets = (items) => items.map((item) => `- ${item}`).join('\n');

// ---------- Hava durumu ----------

const WEATHER_CODES = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light rain showers', 81: 'rain showers', 82: 'heavy rain showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail',
};
const describe = (code) => WEATHER_CODES[code] || 'mixed weather';

async function findPlace(name) {
  const params = new URLSearchParams({ name: name.split(',')[0].trim(), count: '1', language: 'en', format: 'json' });
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  const place = data.results?.[0];
  if (!place) return null;
  return { name: [place.name, place.country].filter(Boolean).join(', '), latitude: place.latitude, longitude: place.longitude };
}

export function currentPosition(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Bu tarayıcı konum desteklemiyor.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'Konum izni verilmedi.' : 'Konum alınamadı.')),
      { timeout, maximumAge: 15 * 60 * 1000, enableHighAccuracy: false },
    );
  });
}

// Şehir söylenmediyse önce telefonun konumu, sonra Ayarlar'daki şehir kullanılır.
async function resolvePlace(query, prefs) {
  if (query) return findPlace(query);
  if (prefs.useLocation) {
    try {
      return { name: 'the learner\'s current location', ...(await currentPosition()) };
    } catch (err) {
      console.warn('Konum alınamadı:', err);
    }
  }
  return prefs.homeCity?.trim() ? findPlace(prefs.homeCity) : null;
}

async function weather(query, prefs) {
  const place = await resolvePlace(query, prefs);
  if (!place) {
    return query
      ? `No place called "${query}" was found. Ask the learner to say the city name again.`
      : 'The learner\'s location is unknown (no city was named, phone location is off and no home city is set). Ask which city they are in.';
  }
  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '3',
  });
  const { current: now, daily } = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
  const r = Math.round;
  const days = ['Today', 'Tomorrow', 'The day after tomorrow'];
  return [
    `Weather for ${place.name}:`,
    `Right now: ${r(now.temperature_2m)}°C (feels like ${r(now.apparent_temperature)}°C), ${describe(now.weather_code)}, wind ${r(now.wind_speed_10m)} km/h.`,
    ...daily.time.map((_, i) => `${days[i]}: ${r(daily.temperature_2m_min[i])} to ${r(daily.temperature_2m_max[i])}°C, ${describe(daily.weather_code[i])}, ${daily.precipitation_probability_max[i] ?? 0}% chance of rain.`),
  ].join('\n');
}

// ---------- Wikipedia ----------

// Okunuş ve IPA gibi sesli okumaya uymayan parantezleri atar; doğum tarihi gibi bilgiler kalır.
const dropPronunciation = (text) => text.replace(/\s*\((?:[^()]|\([^()]*\))*?(?:pronounc|\[|\/|listen)(?:[^()]|\([^()]*\))*\)/gi, '');

async function wikipedia(query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1',
    generator: 'search', gsrsearch: query, gsrlimit: '3',
    prop: 'extracts|description', exintro: '1', explaintext: '1', exsentences: '6', exlimit: '3',
  });
  const data = await getJson(`${WIKI_API}?${params}`);
  const pages = (data.query?.pages || []).filter((p) => p.extract).sort((a, b) => a.index - b.index);
  if (!pages.length) return `Wikipedia has no article matching "${query}".`;
  return pages.slice(0, 2)
    .map((p) => `${p.title}${p.description ? ` (${p.description})` : ''}: ${shorten(clean(dropPronunciation(p.extract)), 900)}`)
    .join('\n\n');
}

// ---------- Haberler ----------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'what', 'about', 'news', 'latest', 'today', 'recent', 'happening', 'happened', 'any', 'new', 'from', 'this', 'week']);

async function parsePage(page) {
  const params = new URLSearchParams({ action: 'parse', format: 'json', formatversion: '2', origin: '*', page, prop: 'text' });
  const data = await getJson(`${WIKI_API}?${params}`);
  return data.parse?.text ? new DOMParser().parseFromString(data.parse.text, 'text/html') : null;
}

const dropPictured = (text) => text.replace(/\s*\([^()]*pictured\)/gi, '');
// Satır sonundaki "(Reuters) (BBC News)" gibi kaynak parantezleri.
const dropSources = (text) => text.replace(/(\s*\([^()]*\))+\s*$/, '');

// Wikipedia ana sayfasındaki "In the news" kutusu: günün önemli haberleri.
async function inTheNews() {
  const doc = await parsePage('Template:In_the_news');
  if (!doc) return [];
  return [...doc.querySelectorAll('li')]
    .map((li) => clean(dropPictured(li.textContent)))
    .filter((text) => text.length > 50 && /[.!?]$/.test(text));
}

// Wikipedia "Current events" portalı: son günlerin haberleri, konu başlıklarıyla.
async function recentEvents(days = 3) {
  const pages = Array.from({ length: days }, (_, n) => {
    const d = new Date(Date.now() - n * 86400000);
    return { label: `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`, page: `Portal:Current_events/${d.getUTCFullYear()}_${MONTHS[d.getUTCMonth()]}_${d.getUTCDate()}` };
  });
  const docs = await Promise.allSettled(pages.map((p) => parsePage(p.page)));
  return docs.flatMap((result, i) => {
    if (result.status !== 'fulfilled' || !result.value) return [];
    return [...result.value.querySelectorAll('.current-events-content li')]
      .filter((li) => !li.querySelector('ul'))
      .map((li) => {
        const topic = clean(li.parentElement?.closest('li')?.firstChild?.textContent || '');
        const text = shorten(clean(dropSources(li.textContent)), 320);
        return `[${pages[i].label}${topic ? `, ${topic}` : ''}] ${text}`;
      });
  });
}

const keywords = (query) => query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP_WORDS.has(w));

async function news(query) {
  const [top, events] = await Promise.all([inTheNews().catch(() => []), recentEvents()]);
  const words = keywords(query);
  if (words.length) {
    const hits = events
      .map((item) => ({ item, score: words.filter((w) => item.toLowerCase().includes(w)).length }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((h) => h.item);
    if (hits.length) return `News matching "${query}" from the last three days:\n${bullets(hits)}`;
    const background = await wikipedia(query).catch(() => '');
    return [
      `No news about "${query}" in the last three days.`,
      background && `Background from Wikipedia:\n${background}`,
    ].filter(Boolean).join('\n\n');
  }
  const items = [...top, ...events].slice(0, 12);
  if (!items.length) throw new Error('no news available');
  return `Top news stories:\n${bullets(items)}`;
}

// ---------- Döviz ----------

const CURRENCY_NAMES = {
  USD: 'US dollar', EUR: 'euro', GBP: 'British pound', TRY: 'Turkish lira', JPY: 'Japanese yen', CHF: 'Swiss franc',
  CNY: 'Chinese yuan', CAD: 'Canadian dollar', AUD: 'Australian dollar', SEK: 'Swedish krona', NOK: 'Norwegian krone',
  DKK: 'Danish krone', PLN: 'Polish zloty', INR: 'Indian rupee', KRW: 'South Korean won', BRL: 'Brazilian real',
};
const CURRENCY_WORDS = { dollar: 'USD', dollars: 'USD', euro: 'EUR', euros: 'EUR', pound: 'GBP', pounds: 'GBP', sterling: 'GBP', lira: 'TRY', tl: 'TRY', yen: 'JPY', franc: 'CHF', yuan: 'CNY' };

async function currency(query) {
  const data = await getJson('https://api.frankfurter.dev/v1/latest');
  const rates = { [data.base]: 1, ...data.rates };
  // "USD TRY" gibi kodlar ya da "dollar", "lira" gibi kelimeler; "how", "the" gibi 3 harfliler elenir.
  const codes = [...new Set(query.split(/[^A-Za-z]+/)
    .map((w) => CURRENCY_WORDS[w.toLowerCase()] || w.toUpperCase())
    .filter((code) => rates[code]))];
  let pairs;
  if (codes.length >= 2) pairs = codes.slice(1).map((to) => [codes[0], to]);
  else if (codes.length === 1 && codes[0] !== 'TRY') pairs = [[codes[0], 'TRY'], [codes[0], codes[0] === 'USD' ? 'EUR' : 'USD']];
  else pairs = [['USD', 'TRY'], ['EUR', 'TRY'], ['GBP', 'TRY']];

  const name = (code) => CURRENCY_NAMES[code] || code;
  const lines = pairs
    .filter(([from, to]) => from !== to && rates[from] && rates[to])
    .map(([from, to]) => {
      const value = rates[to] / rates[from];
      return `1 ${name(from)} = ${value.toLocaleString('en-US', { maximumFractionDigits: value >= 10 ? 2 : 4 })} ${name(to)}`;
    });
  if (!lines.length) return `No exchange rate is available for "${query}".`;
  return `Exchange rates (European Central Bank reference rates, ${data.date}):\n${bullets(lines)}`;
}

// ---------- Dışa açılanlar ----------

export async function lookUp({ kind, query = '' }, prefs) {
  const q = query.trim();
  switch (kind) {
    case 'weather': return { source: 'Open-Meteo', text: await weather(q, prefs) };
    case 'news': return { source: 'Wikipedia current events', text: await news(q) };
    case 'wikipedia': return { source: 'Wikipedia', text: await wikipedia(q) };
    case 'currency': return { source: 'European Central Bank', text: await currency(q) };
    default: throw new Error(`unknown lookup "${kind}"`);
  }
}

// Wikipedia ana sayfasındaki "Did you know" kutusu: ilginç bilgiler.
async function didYouKnow() {
  const doc = await parsePage('Template:Did_you_know');
  if (!doc) return [];
  return [...doc.querySelectorAll('li')]
    .map((li) => clean(dropPictured(li.textContent)))
    .filter((text) => /^(\.\.\.|…)\s*that\b/.test(text))
    .map((text) => text.replace(/^(\.\.\.|…)\s*/, 'Did you know '));
}

// "Gündem", "İlginç bilgiler" ve "Dinleme" konuları için oturum başında alınan sohbet malzemesi.
// kind: 'news' | 'facts' | 'mixed' (ikisinden de biraz)
export async function topicMaterial(kind) {
  let items = [];
  if (kind === 'news' || kind === 'mixed') {
    const [top, events] = await Promise.all([inTheNews().catch(() => []), recentEvents(2).catch(() => [])]);
    items = [...top, ...events.slice(0, kind === 'news' ? 18 : 6)];
  }
  if (kind === 'facts' || kind === 'mixed') items = [...items, ...(await didYouKnow().catch(() => []))];
  if (!items.length) throw new Error('Wikipedia\'dan içerik alınamadı.');
  return bullets(items);
}
