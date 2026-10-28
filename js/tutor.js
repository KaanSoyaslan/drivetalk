// Sohbet partneri, koç (düzeltme), kelime kontrolü ve oturum özeti için istemler.
import { parseJson, GeminiError } from './gemini.js';
import { LOOKUP_KINDS } from './lookup.js';
import { CHARACTERS, characterOf } from './characters.js';

export const TOPIC_GROUPS = [['talk', 'Sohbet'], ['roleplay', 'Rol yapma'], ['practice', 'Pratik']];

// material: oturum başında Wikipedia'dan alınan sohbet malzemesi (lookup.js → topicMaterial).
// roleplay: Sam bir rol oynar. longTurns: hikâye anlatılan uzun cevaplar. quiz: oturum kelime testiyle başlar.
export const TOPICS = [
  { id: 'free', group: 'talk', label: 'Serbest', prompt: 'anything: the learner\'s day, plans, hobbies, opinions; follow whatever the learner brings up' },
  { id: 'news', group: 'talk', label: 'Gündem', material: 'news', prompt: 'today\'s news: talk about the current news stories in the material, one story at a time; explain each story simply, give your own view and ask what the learner thinks' },
  { id: 'learn', group: 'talk', label: 'İlginç bilgiler', material: 'facts', prompt: 'interesting facts: share one surprising fact at a time from the material, explain the background simply, and ask what the learner thinks or whether they knew it' },
  { id: 'daily', group: 'talk', label: 'Günlük hayat', prompt: 'daily life, routines, food, family and weekends' },
  { id: 'work', group: 'talk', label: 'İş', prompt: 'work and career: the learner\'s job, colleagues, meetings, projects and goals' },
  { id: 'travel', group: 'talk', label: 'Seyahat', prompt: 'travel and holidays: past trips, dream destinations, travel situations' },
  { id: 'smalltalk', group: 'talk', label: 'Small talk', prompt: 'small talk with a new colleague or neighbour: weather, weekend, sports, films, the city' },
  { id: 'opinions', group: 'talk', label: 'Fikirler', prompt: 'opinions on everyday issues: technology, cities, education, social media, the future' },
  { id: 'interview', group: 'roleplay', roleplay: true, label: 'İş mülakatı', prompt: 'a job interview: you are a friendly interviewer for a job the learner chooses at the start; ask typical interview questions one at a time and react briefly to each answer' },
  { id: 'airport', group: 'roleplay', roleplay: true, label: 'Havalimanı', prompt: 'at the airport: you are first the check-in agent (passport, luggage, seat), later a passport control officer; add one small problem such as overweight luggage' },
  { id: 'hotel', group: 'roleplay', roleplay: true, label: 'Otel', prompt: 'at a hotel: you are the receptionist; the learner checks in, asks about breakfast and Wi-Fi, and then has a problem with the room' },
  { id: 'restaurant', group: 'roleplay', roleplay: true, label: 'Restoran', prompt: 'at a restaurant: you are the waiter; the learner orders food and drinks, asks about the dishes, has a small problem with the order and pays' },
  { id: 'doctor', group: 'roleplay', roleplay: true, label: 'Doktor', prompt: 'at the doctor\'s: you are a friendly doctor; the learner describes their symptoms, you ask follow-up questions and give simple advice' },
  { id: 'phone', group: 'roleplay', roleplay: true, label: 'Müşteri hizmetleri', prompt: 'a phone call to customer service: you work for the learner\'s internet provider; the learner explains that their internet is not working and you solve it together step by step' },
  { id: 'shop', group: 'roleplay', roleplay: true, label: 'Mağaza', prompt: 'in a clothes shop: you are the shop assistant; the learner wants to return or exchange something they bought' },
  { id: 'listen', group: 'practice', longTurns: true, material: 'mixed', label: 'Dinleme', prompt: 'listening practice: tell the learner a short story (80 to 120 words) based on one item from the material, in simple spoken English for their level; then ask two comprehension questions one at a time, react to each answer (kindly give the right answer if they missed it), ask for their opinion, and then move on to the next item' },
  { id: 'vocab', group: 'practice', quiz: true, label: 'Kelime tekrarı', prompt: 'vocabulary practice: a relaxed conversation that gives the learner many chances to use the phrases they are learning' },
];

const LEVELS = {
  A2: 'Use very simple, common words and short sentences. Avoid idioms and phrasal verbs.',
  B1: 'Use simple everyday vocabulary and clear sentences. Avoid rare idioms.',
  B2: 'Use natural everyday English; common idioms and phrasal verbs are fine.',
  C1: 'Speak fully naturally, with idioms and varied vocabulary, like with a native-speaker friend.',
};

const partnerName = (settings) => characterOf(settings).name;

// En hızlı yanıt için düşünmeyi en aza indir; 3.8 Flash "minimal" desteklemiyor.
const lowestThinking = (model) => (/3\.8/.test(model) ? 'low' : 'minimal');

export const currentTopic = (settings) => (settings.customTopic?.trim() ? null : TOPICS.find((t) => t.id === settings.topic) || TOPICS[0]);

function topicPrompt(settings) {
  return currentTopic(settings)?.prompt || settings.customTopic.trim();
}

// Konu Wikipedia'dan malzeme istiyorsa türü ('news' | 'facts' | 'mixed'), istemiyorsa null.
export function materialKind(settings) {
  return currentTopic(settings)?.material || null;
}

const LOOKUP_RULES = [
  '- You can check live information on the learner\'s phone. Choose "lookup":',
  '  weather: current weather and forecast. query = the city name, or empty for where the learner is.',
  '  news: recent world news. query = a few keywords (for example "Serbia election"), or empty for the top stories.',
  '  wikipedia: facts about a person, place, event, team, film, book, science topic and so on. query = English search words, like a Wikipedia article title.',
  '  currency: exchange rates. query = currency codes, for example "USD TRY".',
  '  none: no lookup needed.',
  '- Use a lookup whenever the learner asks about something current (weather, news, recent events, sports results, exchange rates), asks for a fact you are not completely sure about, or asks you to check or search. Never guess current information. For opinions, personal chat and general knowledge you are sure about, use none and answer directly.',
  '- When you use a lookup, "say" is only a short line like "Good question, let me check." with no facts in it; you will get the results and then answer. Otherwise "say" is your full reply.',
];

const NO_LOOKUP_RULES = [
  '- You cannot access the internet. If the learner asks about current information like today\'s weather or news, say you can\'t check that right now and continue the conversation. Always set "lookup" to none.',
];

function liveRules(settings) {
  return [
    '- Speak only English. If the learner says something in Turkish, understand it, then help them say it in English.',
    '- You can hear the learner\'s voice. If they mispronounce a word so that it is hard to understand, now and then (not every turn) say the word correctly once, slowly and naturally, then continue.',
    settings.lookups
      ? '- Use your tools for current information (weather, news, exchange rates) and for facts you are not sure about; never guess current information. You may say "Let me check." first. Never read out sources, links or brackets.'
      : '- You cannot check live information. If asked about current things like today\'s weather or news, say you can\'t check that right now.',
    '- Call give_feedback when the learner asks for feedback or how they are doing; vocabulary_quiz when they want to practise vocabulary (then ask them to use each phrase in a sentence, one at a time, and call record_quiz_answer after each answer); change_volume when they can\'t hear you well or ask you to be louder or quieter; pause_session when they ask you to wait or pause; end_session when they want to stop or say goodbye.',
    '- Messages that start with [App] come from the app, not from the learner. Follow them and never mention them.',
  ];
}

const ROLEPLAY_RULE = '- This is a role-play. In your first turn, set the scene in one short sentence (for example "Let\'s role-play: I\'m the receptionist and you\'re the guest.") and then say your first line in character. Stay in character and keep it realistic, with one or two small complications. When the scenario is complete, step out of the role, say in one sentence what the learner did well, and offer another scenario or a replay.';

// mode: 'text' düz cevap, 'json' canlı bilgi kararıyla JSON cevap, 'live' Gemini Live sesli sohbet.
function partnerSystem(settings, profile, material, { mode = 'text' } = {}) {
  const topic = currentTopic(settings);
  const character = characterOf(settings);
  const who = settings.learnerName?.trim() ? `${settings.learnerName.trim()}, a` : 'a';
  const focus = profile.focus.map((f) => f.en).filter(Boolean);
  const practice = (profile.practice || []).filter(Boolean);
  const now = new Date().toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const length = topic?.longTurns
    ? 'Keep normal turns to 1 to 3 short sentences; your stories may be 80 to 120 words.'
    : 'Usually 1 to 3 short sentences (at most 45 words); when you are telling the learner about something (news, facts, information they asked for), up to 5 sentences (at most 80 words).';
  const speech = mode === 'live'
    ? `- You are talking by voice in real time. ${length} Speak clearly and a little slower than you would with a native-speaker friend. If the learner asks you to speak slower or faster, or to repeat, do so.`
    : `- Your text is read aloud by text-to-speech. Write only what ${character.name} says, as natural spoken sentences. ${length} No lists, markdown, emojis, URLs, stage directions or phonetic spellings.`;
  return [
    `You are ${character.name}, ${character.persona}. You are talking with ${who} native Turkish speaker (CEFR ${settings.level}) who is practising spoken English hands-free while driving.`,
    `Topic: ${topicPrompt(settings)}.`,
    `Language level: ${LEVELS[settings.level] || LEVELS.B1}`,
    `It is now ${now} (the learner's local time).`,
    'Rules:',
    speech,
    '- Be a real conversation partner, not just a question machine: share interesting facts, your own opinions and experiences, and react to what the learner says. Usually end with one clear, open question that needs a full-sentence answer.',
    '- Never explain grammar or point out mistakes unless you are asked to; feedback is handled separately. If the learner made a mistake, naturally reuse the correct form in your reply without drawing attention to it.',
    '- The learner\'s words come from speech recognition and may contain recognition errors. Interpret them charitably; if something is truly unclear, ask them to say it another way.',
    '- If the learner seems stuck or answers very briefly, ask a simpler question or offer two options to choose from.',
    '- Safety first: if the learner mentions traffic, a difficult road or needing to concentrate, just say "Of course, take your time." Never ask the learner to look at anything or use their hands.',
    topic?.roleplay ? ROLEPLAY_RULE : '',
    focus.length ? `- In earlier sessions the learner needed practice with: ${focus.join('; ')}. When it fits naturally, ask questions that invite these structures.` : '',
    practice.length ? `- The learner is learning these phrases: ${practice.map((p) => `"${p}"`).join(', ')}. When it fits naturally, create chances for them to use them.` : '',
    ...(mode === 'json' ? (settings.lookups ? LOOKUP_RULES : NO_LOOKUP_RULES) : []),
    ...(mode === 'live' ? liveRules(settings) : []),
    material ? `\nMaterial fetched from Wikipedia today. Base the conversation on it; prefer stories about science, technology, sport, culture or positive news over violent or tragic ones when there is a choice, and never read out dates in brackets or source names:\n${material}` : '',
  ].filter(Boolean).join('\n');
}

function transcript(turns, name, limit = 14) {
  return turns.slice(-limit)
    .map((t) => `${t.role === 'partner' ? name : 'Learner'}: ${t.text}`)
    .join('\n');
}

const SPEAKER_PREFIX = new RegExp(`^\\s*(${['Partner', ...CHARACTERS.map((c) => c.name)].join('|')})\\s*:\\s*`, 'i');
const cleanSpeech = (text) => text.replace(SPEAKER_PREFIX, '').replace(/[*_#`]/g, '').trim();

const PARTNER_TASKS = {
  open: 'This is the start of the conversation. Greet the learner in one short sentence and ask an easy first question about the topic.',
  newtopic: 'The learner asked to change the topic (or for the next question). Acknowledge in a few words and move to something clearly different with an easy question.',
};

const MATERIAL_TASKS = {
  open: 'This is the start of the conversation. Greet the learner in one short sentence. Then tell them about one item from the material in 2 or 3 simple sentences and ask what they think.',
  newtopic: 'The learner asked for something new. Acknowledge in a few words, then tell them about a different item from the material that has not been discussed yet, in 2 or 3 simple sentences, and ask what they think.',
};

function openTask(settings, material) {
  const topic = currentTopic(settings);
  if (topic?.quiz) return 'A short vocabulary quiz has just finished. Without greeting again, start a relaxed conversation with an easy question that invites the learner to use some of the phrases they are learning.';
  if (topic?.roleplay) return 'This is the start of the session. Start the role-play now as described in your rules.';
  if (topic?.longTurns) return 'This is the start of the session. Greet the learner in one short sentence, say that you will tell a short story and then ask a couple of questions, and tell the first story.';
  return (material ? MATERIAL_TASKS : PARTNER_TASKS).open;
}

function newTopicTask(settings, material) {
  const topic = currentTopic(settings);
  if (topic?.roleplay) return 'The learner asked for something new. Step out of the role and start a different scenario in a similar setting.';
  if (topic?.longTurns) return 'The learner asked for something new. Tell a new short story based on a different item from the material.';
  return (material ? MATERIAL_TASKS : PARTNER_TASKS).newtopic;
}

// Oturum açılışı ve konu değişikliği: düz metin.
export async function partnerOpener(llm, settings, profile, turns, kind, material = '') {
  const task = kind === 'open' ? openTask(settings, material) : newTopicTask(settings, material);
  const text = await llm.generate({
    purpose: kind,
    model: settings.partnerModel,
    system: partnerSystem(settings, profile, material),
    input: `${turns.length ? `Conversation so far:\n${transcript(turns, partnerName(settings))}\n\n` : ''}${task}`,
    thinking: lowestThinking(settings.partnerModel),
    maxTokens: 800,
  });
  return cleanSpeech(text);
}

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    lookup: { type: 'string', enum: ['none', ...LOOKUP_KINDS] },
    query: { type: 'string' },
    say: { type: 'string' },
  },
  required: ['lookup', 'query', 'say'],
};

// Öğrencinin cümlesine cevap. Model canlı bilgi gerektiğine karar verirse
// { text: "let me check" gibi kısa cümle, lookup: { kind, query } } döner.
export async function partnerTurn(llm, settings, profile, turns, material = '') {
  const last = turns[turns.length - 1];
  const raw = await llm.generate({
    purpose: 'reply',
    model: settings.partnerModel,
    system: partnerSystem(settings, profile, material, { mode: 'json' }),
    input: `Conversation so far:\n${transcript(turns.slice(0, -1), partnerName(settings))}\n\nThe learner just said: "${last.text}"\n\nWrite ${partnerName(settings)}'s next reply as JSON.`,
    schema: REPLY_SCHEMA,
    thinking: lowestThinking(settings.partnerModel),
    maxTokens: 800,
  });
  let result;
  try {
    result = parseJson(raw);
  } catch {
    return { text: cleanSpeech(raw), lookup: null }; // JSON gelmediyse metni olduğu gibi kullan
  }
  const kind = settings.lookups && LOOKUP_KINDS.includes(result.lookup) ? result.lookup : null;
  const text = cleanSpeech(String(result.say || ''));
  if (!kind && !text) throw new GeminiError('empty', 'Model boş yanıt döndürdü.');
  return { text, lookup: kind ? { kind, query: String(result.query || '').trim() } : null };
}

// Telefonda bulunan bilgiyle öğrencinin sorusunu cevaplar: düz metin.
export async function partnerAnswer(llm, settings, profile, turns, found, material = '') {
  const last = turns[turns.length - 1];
  const text = await llm.generate({
    purpose: 'answer',
    model: settings.partnerModel,
    system: partnerSystem(settings, profile, material),
    input: [
      `Conversation so far:\n${transcript(turns.slice(0, -1), partnerName(settings))}`,
      `The learner just said: "${last.text}"`,
      `You looked this up just now (${found.source}):\n${found.text}`,
      `Now answer the learner as ${partnerName(settings)}, using this information for anything current. Up to 5 short spoken sentences (at most 80 words) in simple English for their level. Round numbers naturally ("about 18 degrees") and do not read out sources, links or brackets. If the information does not answer the question, say so honestly and share what you did find. End with a question about the learner's opinion or experience.`,
    ].join('\n\n'),
    thinking: lowestThinking(settings.partnerModel),
    maxTokens: 800,
  });
  return cleanSpeech(text);
}

// ---------- Canlı mod (Gemini Live) ----------

const LOOKUP_TOOLS = [
  {
    name: 'get_weather',
    description: 'Current weather and a 3-day forecast. Use for any question about the weather, temperature or rain.',
    parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name in English; empty for the learner\'s own location.' } } },
  },
  {
    name: 'search_news',
    description: 'World news from the last three days (Wikipedia current events).',
    parameters: { type: 'object', properties: { keywords: { type: 'string', description: 'A few English keywords; empty for the top stories.' } } },
  },
  {
    name: 'search_wikipedia',
    description: 'Facts about a person, place, event, team, film, book or any topic.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'English search words, like a Wikipedia article title.' } }, required: ['query'] },
  },
  {
    name: 'get_exchange_rates',
    description: 'Current exchange rates (European Central Bank).',
    parameters: { type: 'object', properties: { currencies: { type: 'string', description: 'Currency codes such as "USD TRY"; empty for the dollar, euro and pound in Turkish lira.' } } },
  },
];

const SESSION_TOOLS = [
  { name: 'give_feedback', description: 'Get the learner\'s recent English mistakes found by the coach. Call when the learner asks for feedback, corrections or how they are doing.' },
  { name: 'vocabulary_quiz', description: 'Get the phrases the learner is learning, to quiz them. Call when the learner asks for a vocabulary quiz or review.' },
  {
    name: 'record_quiz_answer',
    description: 'Save the result of one vocabulary quiz question.',
    parameters: { type: 'object', properties: { phrase: { type: 'string' }, correct: { type: 'boolean' } }, required: ['phrase', 'correct'] },
  },
  {
    name: 'change_volume',
    description: 'Make your voice louder or quieter. Call when the learner says they can\'t hear you well, or asks you to be louder or quieter.',
    parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] } }, required: ['direction'] },
  },
  { name: 'pause_session', description: 'Pause the practice when the learner asks you to wait, pause or hold on.' },
  { name: 'end_session', description: 'End the practice session when the learner says goodbye or wants to stop.' },
];

export function liveTools(settings) {
  return [...(settings.lookups ? LOOKUP_TOOLS : []), ...SESSION_TOOLS];
}

export function liveSystem(settings, profile, material) {
  return partnerSystem(settings, profile, material, { mode: 'live' });
}

export function liveOpener(settings, material) {
  const task = currentTopic(settings)?.quiz
    ? 'This is the start of the session. Greet the learner in one short sentence, then call vocabulary_quiz and start the quiz.'
    : openTask(settings, material);
  return `[App] ${task}`;
}

// ---------- Koç ----------

const COACH_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string' },
          better: { type: 'string' },
          explanation: { type: 'string' },
          explanation_tr: { type: 'string' },
          category: { type: 'string', enum: ['grammar', 'vocabulary', 'naturalness'] },
          severity: { type: 'integer', enum: [1, 2, 3] },
        },
        required: ['original', 'better', 'explanation', 'explanation_tr', 'category', 'severity'],
      },
    },
    natural_version: { type: 'string' },
  },
  required: ['issues', 'natural_version'],
};

function coachSystem(settings) {
  return [
    `You are an expert English teacher giving feedback to a native Turkish speaker (CEFR ${settings.level}) who is practising spoken English.`,
    'You receive ONE spoken utterance, transcribed automatically by speech recognition, and the line it was answering.',
    'Find the problems a good teacher would correct: grammar (tense, articles, prepositions, word order, agreement, plurals), wrong word choice, and phrases that are understandable but unnatural (a native speaker would say it differently). Typical Turkish-speaker errors are worth flagging.',
    'Ignore punctuation, capitalisation, spelling, filler words (um, uh, like), false starts, and anything that is probably a speech-recognition error rather than the learner\'s own mistake. Do not flag casual but correct spoken English.',
    'For each problem (at most 3, most important first):',
    '- original: the exact problematic words from the utterance',
    '- better: the corrected words (a short phrase, not the whole sentence)',
    '- explanation: why, in at most 15 simple English words, suitable to be read aloud',
    '- explanation_tr: the same explanation in Turkish, one sentence',
    '- category: grammar, vocabulary or naturalness',
    '- severity: 1 = minor polish, 2 = clear mistake, 3 = serious (meaning unclear or a very basic error)',
    'natural_version: how a native speaker would naturally say the whole utterance, keeping the learner\'s meaning (repeat it if it is already fine).',
    'If there are no real problems, return an empty issues list. Respond with JSON only.',
  ].join('\n');
}

export async function analyzeUtterance(llm, settings, previousLine, text) {
  const raw = await llm.generate({
    purpose: 'coach',
    model: settings.coachModel,
    system: coachSystem(settings),
    input: `Line being answered: "${previousLine || '(start of conversation)'}"\nLearner said: "${text}"`,
    schema: COACH_SCHEMA,
    thinking: 'low',
    maxTokens: 1500,
  });
  const result = parseJson(raw);
  const issues = (Array.isArray(result.issues) ? result.issues : [])
    .filter((i) => i && i.original && i.better && i.original.trim().toLowerCase() !== i.better.trim().toLowerCase())
    .map((i) => ({ ...i, severity: Number(i.severity) || 1 }));
  return { issues, natural: result.natural_version || '' };
}

// ---------- Kelime testi ----------

const JUDGE_SCHEMA = {
  type: 'object',
  properties: { correct: { type: 'boolean' }, feedback: { type: 'string' } },
  required: ['correct', 'feedback'],
};

export async function judgeVocab(llm, settings, item, sentence) {
  const raw = await llm.generate({
    purpose: 'judge',
    model: settings.coachModel,
    system: [
      `You check a vocabulary exercise for a native Turkish speaker (CEFR ${settings.level}) who is driving. They were asked to say a sentence using a phrase.`,
      'Their sentence comes from speech recognition, so ignore small recognition errors.',
      '- correct: true if they used the phrase (or a natural form of it, such as another tense) with the right meaning, even if there are small unrelated mistakes.',
      '- feedback: what you say aloud, at most 30 words, warm and simple. If correct, praise briefly and, only if needed, say a more natural version. If not, explain briefly and give one natural example sentence with the phrase.',
      'Respond with JSON only.',
    ].join('\n'),
    input: `Phrase: "${item.en}"${item.tr ? ` (Turkish: ${item.tr})` : ''}\nLearner said: "${sentence}"`,
    schema: JUDGE_SCHEMA,
    thinking: 'low',
    maxTokens: 600,
  });
  const result = parseJson(raw);
  return { correct: Boolean(result.correct), feedback: String(result.feedback || '').trim() };
}

// ---------- Oturum özeti ----------

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    spoken_summary: { type: 'string' },
    focus: { type: 'array', items: { type: 'string' } },
    focus_tr: { type: 'array', items: { type: 'string' } },
    phrases: {
      type: 'array',
      items: {
        type: 'object',
        properties: { en: { type: 'string' }, tr: { type: 'string' }, example: { type: 'string' } },
        required: ['en', 'tr', 'example'],
      },
    },
  },
  required: ['spoken_summary', 'focus', 'focus_tr', 'phrases'],
};

export async function summarizeSession(llm, settings, issues, learnerTurns, sentences = []) {
  const system = [
    `You are an English teacher closing a speaking-practice session with a native Turkish speaker (CEFR ${settings.level}) who is driving.`,
    'You get the issues found during the session as JSON, and what the learner said.',
    '- spoken_summary: what you say aloud now, at most 90 words, warm and encouraging. Pick the 2 or 3 most important or most repeated points. For each, say what they said and the better version, for example: You said "I go yesterday"; say "I went yesterday". If there were no real mistakes, praise one specific thing they did well. Natural spoken sentences only, no lists or markdown.',
    '- focus: up to 3 short focus areas for future practice, in English (for example "past simple of irregular verbs").',
    '- focus_tr: the same focus areas in Turkish, in the same order.',
    '- phrases: up to 5 useful English words or phrases for the learner to learn from this session: the correct forms behind their most important mistakes, and natural expressions that would have helped them say what they wanted. en: the phrase in base form, 1 to 6 words (for example "look forward to"); tr: its Turkish meaning; example: one short natural example sentence.',
    'Respond with JSON only.',
  ].join('\n');
  const compact = issues.map(({ original, better, category, severity }) => ({ original, better, category, severity }));
  const said = sentences.slice(-20).map((s) => `- ${s}`).join('\n');
  const raw = await llm.generate({
    purpose: 'summary',
    model: settings.coachModel,
    system,
    input: `The learner spoke ${learnerTurns} times. Issues:\n${JSON.stringify(compact)}${said ? `\n\nWhat the learner said (natural versions):\n${said}` : ''}`,
    schema: SUMMARY_SCHEMA,
    thinking: 'low',
    maxTokens: 2000,
  });
  const result = parseJson(raw);
  return {
    spoken: String(result.spoken_summary || '').trim(),
    focus: (result.focus || []).slice(0, 3),
    focusTr: (result.focus_tr || []).slice(0, 3),
    phrases: (Array.isArray(result.phrases) ? result.phrases : []).filter((p) => p?.en?.trim()).slice(0, 5),
  };
}

// API'ye gitmeden, biriken hataları sesli okunacak metne çevirir.
export function issuesToSpeech(issues) {
  return issues.map((i) => `You said "${i.original}". Better: "${i.better}". ${i.explanation}`).join(' ');
}
