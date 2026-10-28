// Ayarlar, oturum geçmişi, öğrenci profili ve kelime defteri cihazın localStorage'ında tutulur.
const KEYS = {
  settings: 'drivetalk.settings',
  sessions: 'drivetalk.sessions',
  profile: 'drivetalk.profile',
  vocab: 'drivetalk.vocab',
};

const MAX_SESSIONS = 60;

export const DEFAULT_SETTINGS = {
  apiKey: '',
  learnerName: '',
  partnerModel: 'gemini-3.5-flash-lite',
  coachModel: 'gemini-3.8-flash',
  character: 'sam', // characters.js
  voiceMode: 'classic', // 'classic' = telefonun sesi, 'live' = Gemini Live
  liveModel: 'gemini-3.8-live',
  liveVoice: 'Puck',
  bargeIn: true,
  voiceProcessing: true, // Canlı mod mikrofonunda yankı engelleme + gürültü azaltma
  noiseFilter: 'auto', // yol uğultusu filtresi (noise.js): 'auto' | 'on' | 'off'
  voiceVolume: 1, // Canlı modda karakterin ses yüksekliği: 1 = %100, 5 = %500
  micId: '', // '' = telefon seçer (devices.js)
  micLabel: '',
  speakerId: '',
  speakerLabel: '',
  mediaKeys: true,
  level: 'B1',
  topic: 'free',
  customTopic: '',
  feedbackMode: 'periodic',
  feedbackEvery: 5,
  voiceURI: '',
  rate: 0.95,
  graceMs: 1500,
  lookups: true,
  homeCity: '',
  useLocation: false,
  demo: false,
  typeMode: false,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  const settings = { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
  if (settings.character === 'mochi') settings.character = 'tiko'; // kedinin eski adı
  return settings;
}

export function saveSettings(settings) {
  return write(KEYS.settings, settings);
}

export function loadSessions() {
  const sessions = read(KEYS.sessions, []);
  return Array.isArray(sessions) ? sessions : [];
}

export function saveSession(session) {
  const others = loadSessions().filter((s) => s.id !== session.id);
  return write(KEYS.sessions, [session, ...others].slice(0, MAX_SESSIONS));
}

export function clearSessions() {
  return write(KEYS.sessions, []);
}

export function loadProfile() {
  return { focus: [], ...read(KEYS.profile, {}) };
}

export function saveProfile(profile) {
  return write(KEYS.profile, profile);
}

// ---------- Kelime defteri (Leitner kutuları) ----------
// Doğru cevapta ifade bir üst kutuya çıkar ve daha seyrek sorulur; yanlışta 1. kutuya döner.

const DAY = 86400000;
const VOCAB_INTERVALS = [0, 1, 3, 7, 16, 35]; // 1.–6. kutu için gün
export const LEARNED_BOX = 5;
export const MAX_BOX = VOCAB_INTERVALS.length;

export function loadVocab() {
  const list = read(KEYS.vocab, []);
  return Array.isArray(list) ? list : [];
}

export function saveVocab(list) {
  return write(KEYS.vocab, list);
}

export function addVocab(items, source = 'session') {
  const list = loadVocab();
  const known = new Set(list.map((v) => v.en.toLowerCase()));
  let added = 0;
  for (const item of items) {
    const en = String(item.en || '').trim();
    if (!en || known.has(en.toLowerCase())) continue;
    known.add(en.toLowerCase());
    list.unshift({
      id: crypto.randomUUID?.() || `${Date.now()}-${added}`,
      en,
      tr: String(item.tr || '').trim(),
      example: String(item.example || '').trim(),
      source,
      box: 1,
      due: Date.now(),
      added: Date.now(),
      right: 0,
      wrong: 0,
    });
    added += 1;
  }
  if (added) saveVocab(list);
  return added;
}

export function dueVocab(limit = 5, now = Date.now()) {
  return loadVocab()
    .filter((v) => v.due <= now)
    .sort((a, b) => a.box - b.box || a.due - b.due)
    .slice(0, limit);
}

export function reviewVocab(phrase, correct, now = Date.now()) {
  const key = String(phrase || '').trim().toLowerCase();
  if (!key) return null;
  const list = loadVocab();
  const item = list.find((v) => v.en.toLowerCase() === key)
    || list.find((v) => key.includes(v.en.toLowerCase()) || v.en.toLowerCase().includes(key));
  if (!item) return null;
  item.box = correct ? Math.min(MAX_BOX, item.box + 1) : 1;
  item.due = now + VOCAB_INTERVALS[item.box - 1] * DAY;
  item[correct ? 'right' : 'wrong'] = (item[correct ? 'right' : 'wrong'] || 0) + 1;
  item.lastReview = now;
  saveVocab(list);
  return item;
}

export function removeVocab(id) {
  return saveVocab(loadVocab().filter((v) => v.id !== id));
}

// Yeni odak alanlarını başa ekler, tekrarları atar, en fazla 5 tane tutar.
export function mergeFocus(profile, focus = [], focusTr = []) {
  const merged = [...focus.map((en, i) => ({ en, tr: focusTr[i] || '' })), ...profile.focus];
  const seen = new Set();
  profile.focus = merged.filter((f) => {
    const key = f.en.toLowerCase();
    if (!f.en || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
  return profile;
}
