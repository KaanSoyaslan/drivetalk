// Gemini API istemcisi (Interactions API, durumsuz). Anahtar doğrudan tarayıcıdan gönderilir;
// bu yüzden anahtar koda yazılmaz, sadece kullanıcının cihazında saklanır.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const RETRY_DELAYS = [1500, 4000];

export class GeminiError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.kind = kind; // 'auth' | 'rate' | 'network' | 'server' | 'bad-request' | 'empty'
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path, apiKey, body) {
  let response;
  try {
    response = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GeminiError('network', 'İnternet bağlantısı yok ya da Gemini\'ye ulaşılamıyor.');
  }
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// Interactions uç noktası hatayı dizi içinde döndürebiliyor: [{ "error": { ... } }]
function errorText(data) {
  const body = Array.isArray(data) ? data[0] : data;
  return body?.error?.message || body?.errors?.[0]?.message || '';
}

function toError(status, data) {
  const message = errorText(data);
  if (status === 401 || status === 403 || /api key/i.test(message)) {
    return new GeminiError('auth', 'API anahtarı geçersiz ya da yetkisiz. Ayarlar\'dan kontrol et.', status);
  }
  if (status === 429) return new GeminiError('rate', 'Ücretsiz kullanım sınırına takıldı, biraz bekle.', status);
  if (status >= 500) return new GeminiError('server', `Gemini geçici hata verdi (${status}).`, status);
  return new GeminiError('bad-request', message || `İstek reddedildi (${status}).`, status);
}

// Yanıttaki model metnini toplar. Interactions yanıtında metin steps[].content[] içinde gelir;
// eski biçimler için outputs[] ve generateContent'in candidates[] alanı da okunur.
function extractText(data) {
  const texts = [];
  for (const step of data.steps || []) {
    if (step.type && step.type !== 'model_output') continue;
    const content = Array.isArray(step.content) ? step.content : [step.content];
    for (const item of content) if (item?.type === 'text' && item.text) texts.push(item.text);
  }
  if (!texts.length) {
    for (const item of data.outputs || []) if (item?.type === 'text' && item.text) texts.push(item.text);
  }
  if (!texts.length) {
    for (const part of data.candidates?.[0]?.content?.parts || []) if (part.text && !part.thought) texts.push(part.text);
  }
  return texts.join('').trim();
}

export function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new GeminiError('empty', 'Model geçerli JSON döndürmedi.');
  }
}

// Interactions API desteklenmiyorsa (404) klasik generateContent ile dener.
async function generateContentFallback(apiKey, { model, system, input, schema, maxTokens }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseJsonSchema = schema;
  }
  return post(`models/${encodeURIComponent(model)}:generateContent`, apiKey, body);
}

export function createGemini(apiKey) {
  return {
    async generate({ model, system, input, schema = null, thinking = null, maxTokens = 800 }) {
      const body = {
        model,
        input,
        system_instruction: system,
        store: false,
        generation_config: { max_output_tokens: maxTokens },
      };
      if (thinking) body.generation_config.thinking_level = thinking;
      if (schema) body.response_format = { type: 'text', mime_type: 'application/json', schema };

      for (let attempt = 0; ; attempt++) {
        let result = await post('interactions', apiKey, body);

        // Bazı modeller her düşünme seviyesini desteklemiyor; o zaman varsayılanla tekrar dene.
        if (result.status === 400 && body.generation_config.thinking_level && /thinking/i.test(errorText(result.data))) {
          delete body.generation_config.thinking_level;
          result = await post('interactions', apiKey, body);
        }
        if (result.status === 404) {
          result = await generateContentFallback(apiKey, { model, system, input, schema, maxTokens });
        }

        if (result.ok) {
          const text = extractText(result.data);
          if (!text) throw new GeminiError('empty', 'Model boş yanıt döndürdü.');
          return text;
        }
        const retriable = result.status === 429 || result.status >= 500;
        if (!retriable || attempt >= RETRY_DELAYS.length) throw toError(result.status, result.data);
        await sleep(RETRY_DELAYS[attempt]);
      }
    },
  };
}

// API anahtarı olmadan arayüzü denemek için hazır cevaplar veren sahte istemci.
const MOCK_REPLIES = [
  'That sounds interesting! What did you do after that?',
  'I see. How did you feel about it?',
  'Nice. Do you usually do that on weekends, or only sometimes?',
  'Really? Tell me a bit more about that.',
  'Good point. What would you change if you could?',
];

const MOCK_RULES = [
  [/\bi am agree\b/i, 'I am agree', 'I agree', 'Agree is a verb; do not use am before it.', '"Agree" fiildir, önüne "am" gelmez.', 'grammar', 2],
  [/\b(he|she|it) (go|do|have|like|want)\b/i, null, null, 'Add -s to the verb after he, she or it.', 'He/she/it ile fiile -s eklenir.', 'grammar', 2],
  [/\bi go\b.*\byesterday\b|\byesterday\b.*\bi go\b/i, 'I go', 'I went', 'Use the past simple for yesterday.', 'Geçmiş zaman için "went" kullanılır.', 'grammar', 3],
  [/\bmake (my )?homework\b/i, 'make homework', 'do homework', 'We do homework, not make it.', 'Ödev için "do" kullanılır.', 'vocabulary', 2],
  [/\bmore better\b/i, 'more better', 'better', 'Better is already comparative.', '"Better" zaten karşılaştırma bildirir.', 'grammar', 2],
];

function mockAnalyze(text) {
  const issues = [];
  for (const [re, original, better, explanation, explanationTr, category, severity] of MOCK_RULES) {
    const match = text.match(re);
    if (!match) continue;
    const found = original || match[0];
    const fixed = better || match[0].replace(/\b(go|do|have|like|want)\b/i, (v) => ({ go: 'goes', do: 'does', have: 'has' }[v.toLowerCase()] || `${v}s`));
    issues.push({ original: found, better: fixed, explanation, explanation_tr: explanationTr, category, severity });
  }
  let natural = text;
  for (const issue of issues) {
    const escaped = issue.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    natural = natural.replace(new RegExp(escaped, 'i'), issue.better);
  }
  return { issues, natural_version: natural };
}

// Demo modunda hangi cümlelerin canlı bilgi gerektirdiğini kabaca tahmin eder; gerçek modda buna model karar verir.
export function mockLookup(said) {
  const s = said.toLowerCase();
  if (/\b(weather|rain|raining|sunny|temperature|forecast)\b/.test(s)) {
    return { lookup: 'weather', query: said.match(/\b(?:in|for) ([A-Z][\p{L}-]+)/u)?.[1] || '' };
  }
  if (/\b(dollar|euro|pound|lira|exchange rates?|currency)\b/.test(s)) return { lookup: 'currency', query: said };
  if (/\bnews\b|\bhappening\b/.test(s)) return { lookup: 'news', query: said.match(/\babout (.+?)[?.!]*$/i)?.[1] || '' };
  const topic = said.match(/\b(?:tell me about|who (?:is|was)|what (?:is|was))\s+(?:the\s+)?(.+?)[?.!]*$/i)?.[1];
  return topic ? { lookup: 'wikipedia', query: topic } : null;
}

const shorten = (text, max) => (text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')}…`);

export function createMockGemini() {
  let turn = 0;
  let item = 0;
  return {
    async generate({ purpose, system = '', input }) {
      await sleep(500);
      const material = system.split('Material fetched from Wikipedia today')[1];
      if (material && (purpose === 'open' || purpose === 'newtopic')) {
        const items = material.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).replace(/^\[[^\]]*\]\s*/, ''));
        const intro = purpose === 'open' ? 'Hi! Here is something interesting from today.' : 'Okay, something different.';
        return `${intro} ${shorten(items[item++ % items.length], 220)} What do you think about that?`;
      }
      if (purpose === 'open') return 'Hi! Nice to talk with you. How has your day been so far?';
      if (purpose === 'newtopic') return 'Okay, new topic! What kind of music do you like to listen to in the car?';
      if (purpose === 'reply') {
        const said = input.match(/The learner just said: "([\s\S]*?)"\n/)?.[1] || '';
        const lookup = mockLookup(said);
        if (lookup) return JSON.stringify({ ...lookup, say: 'Good question, let me check.' });
        turn += 1;
        return JSON.stringify({ lookup: 'none', query: '', say: MOCK_REPLIES[turn % MOCK_REPLIES.length] });
      }
      if (purpose === 'answer') {
        const found = input.match(/You looked this up just now \([^)]*\):\n([\s\S]*?)\n\nNow answer/)?.[1] || '';
        const facts = found.split('\n').map((l) => l.replace(/^- /, '')).filter((l) => l && !l.endsWith(':')).slice(0, 2).join(' ');
        return `Here's what I found. ${shorten(facts, 260)} What do you think about that?`;
      }
      if (purpose === 'coach') {
        const said = input.match(/Learner said: "([\s\S]*)"\s*$/)?.[1] || '';
        return JSON.stringify(mockAnalyze(said));
      }
      if (purpose === 'summary') {
        return JSON.stringify({
          spoken_summary: 'Great work today! One thing to remember: when you talk about yesterday, use the past tense, like "I went" instead of "I go". See you next time.',
          focus: ['past simple of irregular verbs'],
          focus_tr: ['Düzensiz fiillerin geçmiş zamanı'],
          phrases: [
            { en: 'I went', tr: 'gittim', example: 'I went to the office yesterday.' },
            { en: 'look forward to', tr: 'dört gözle beklemek', example: 'I look forward to the weekend.' },
          ],
        });
      }
      if (purpose === 'judge') {
        const phrase = input.match(/Phrase: "([^"]*)"/)?.[1] || '';
        const said = input.match(/Learner said: "([\s\S]*)"\s*$/)?.[1] || '';
        const correct = said.toLowerCase().includes(phrase.split(' ')[0].toLowerCase());
        return JSON.stringify({
          correct,
          feedback: correct ? 'Great sentence, that is exactly right!' : `Not quite. For example: I really ${phrase} it.`,
        });
      }
      turn += 1;
      return MOCK_REPLIES[turn % MOCK_REPLIES.length];
    },
  };
}
