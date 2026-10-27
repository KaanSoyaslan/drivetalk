import {
  loadSettings, saveSettings, loadSessions, saveSession, clearSessions, loadProfile, saveProfile, mergeFocus,
  loadVocab, addVocab, dueVocab, reviewVocab, removeVocab, LEARNED_BOX, MAX_BOX,
} from './store.js';
import { Listener, TypedListener, Speaker, ListenError, recognitionSupported, synthesisSupported } from './speech.js';
import { createGemini, createMockGemini, GeminiError } from './gemini.js';
import {
  TOPICS, TOPIC_GROUPS, currentTopic, materialKind, partnerOpener, partnerTurn, partnerAnswer, analyzeUtterance,
  judgeVocab, summarizeSession, issuesToSpeech, liveSystem, liveTools, liveOpener,
} from './tutor.js';
import { lookUp, topicMaterial, currentPosition, LOOKUP_LABELS } from './lookup.js';
import { LiveClient, LIVE_VOICES } from './live.js';
import { MockLiveSocket } from './live-mock.js';
import { MediaKeys } from './media-keys.js';
import { parseCommand } from './commands.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
const DAY_MS = 86400000;

const forceDemo = new URLSearchParams(location.search).has('demo');
const settings = loadSettings();
const isDemo = () => settings.demo || forceDemo;
const speaker = new Speaker();
const mediaKeys = new MediaKeys();
let session = null;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child);
  return node;
}

// ---------- Canlı ekran ----------

const STATE_LABELS = {
  idle: 'Hazır',
  listening: 'Dinliyorum',
  thinking: 'Düşünüyor…',
  speaking: 'Konuşuyor',
  paused: 'Duraklatıldı',
  summary: 'Özet hazırlanıyor…',
};
const STATE_HINTS = {
  listening: 'bitirdiysen dokun',
  speaking: 'atlamak için dokun',
  paused: '"continue" de',
};

const ui = {
  current: 'idle',
  state(name, hint) {
    this.current = name;
    $('orb').className = `orb ${name}`;
    $('orbLabel').textContent = STATE_LABELS[name];
    $('orbHint').textContent = hint ?? STATE_HINTS[name] ?? '';
  },
  partner(text) { $('partnerLine').textContent = text; },
  interim(text) { $('interim').textContent = text; },
  tip(text) { $('tipLine').textContent = text; },
  error(text) { $('errorLine').textContent = text; },
};

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* desteklenmiyorsa ekran zaman aşımı ayarı geçerli olur */ }
}
document.addEventListener('visibilitychange', () => {
  if (session?.active && document.visibilityState === 'visible') keepAwake(true);
});

function topicLabel() {
  return settings.customTopic?.trim() || (TOPICS.find((t) => t.id === settings.topic) || TOPICS[0]).label;
}

// ---------- Oturum (Klasik mod: telefonun konuşma tanıması ve sesi) ----------

class Session {
  constructor({ llm, listener }) {
    this.llm = llm;
    this.listener = listener;
    // Tekrar zamanı gelen ifadeler Sam'e verilir; sohbette kullanma fırsatı yaratır.
    this.profile = { ...loadProfile(), practice: dueVocab(3).map((v) => v.en) };
    this.record = {
      id: crypto.randomUUID?.() || String(Date.now()),
      startedAt: new Date().toISOString(),
      endedAt: null,
      mode: 'classic',
      topic: topicLabel(),
      level: settings.level,
      turns: [],
      summary: null,
    };
    this.active = false;
    this.endRequested = false;
    this.finishing = false;
    this.skipSummary = false;
    this.paused = false;
    this.pausedByButton = false;
    this.resumeWaiter = null;
    this.announceResume = false;
    this.pendingCommand = null;
    this.lastPartner = '';
    this.learnerCount = 0;
    this.nudged = false;
    this.failures = 0;
    this.material = '';
  }

  startMediaKeys() {
    if (!settings.mediaKeys) return;
    mediaKeys.start({
      playPause: () => this.togglePause(),
      next: () => this.mediaNext(),
      previous: () => this.mediaPrevious(),
    });
  }

  mediaNext() { this.queueCommand('newtopic'); }

  mediaPrevious() { this.queueCommand('repeat'); }

  // Direksiyon tuşu gibi dışarıdan gelen komut: Sam'i susturur, dinlemeyi bırakır, döngüde hemen çalışır.
  queueCommand(command) {
    if (this.paused || this.endRequested || this.finishing) return;
    this.pendingCommand = command;
    speaker.cancel();
    this.listener.stop();
  }

  // "Gündem", "İlginç bilgiler" ve "Dinleme" konularında sohbet malzemesini Wikipedia'dan alır.
  async loadMaterial() {
    const kind = materialKind(settings);
    if (!kind) return;
    ui.state('thinking', kind === 'news' ? 'haberler alınıyor' : 'içerik alınıyor');
    try {
      this.material = await topicMaterial(kind);
    } catch (err) {
      console.warn('Malzeme alınamadı:', err);
      ui.error('Wikipedia\'dan içerik alınamadı; normal sohbetle devam ediliyor.');
    }
  }

  async run() {
    this.active = true;
    keepAwake(true);
    this.startMediaKeys();
    try {
      await this.loadMaterial();
      if (currentTopic(settings)?.quiz) await this.runQuiz({ intro: true });
      if (!this.endRequested) await this.partnerSays('open');
      while (!this.endRequested) {
        if (this.paused && this.pausedByButton) {
          ui.state('paused', 'devam için Duraklat\'a bas');
          await new Promise((resolve) => { this.resumeWaiter = resolve; });
          continue;
        }
        if (this.announceResume) {
          this.announceResume = false;
          await this.say(`Okay, let's continue. ${this.lastPartner}`);
          continue;
        }
        if (this.pendingCommand) {
          const command = this.pendingCommand;
          this.pendingCommand = null;
          await this.runCommand(command);
          continue;
        }

        ui.state(this.paused ? 'paused' : 'listening');
        let heard;
        try {
          heard = await this.listener.listenOnce({ onInterim: (t) => ui.interim(t) });
        } catch (err) {
          if (await this.handleListenError(err)) continue;
          break;
        }
        ui.interim('');
        if (this.endRequested) break;
        if (heard === null) continue;

        const text = heard.trim();
        if (!text) {
          if (!this.paused && !this.nudged) {
            this.nudged = true;
            await this.say('No rush. I\'m here whenever you\'re ready.');
          }
          continue;
        }
        this.nudged = false;

        const command = parseCommand(text);
        if (this.paused) {
          if (command === 'resume') await this.resume();
          else if (command === 'end') this.endRequested = true;
          continue;
        }
        if (command && command !== 'resume') {
          await this.runCommand(command);
          continue;
        }
        await this.learnerTurn(text);
      }
      await this.finish();
    } catch (err) {
      console.error(err);
      ui.error(err.message || String(err));
      this.save();
    } finally {
      this.active = false;
      keepAwake(false);
      mediaKeys.stop();
      sessionEnded(this);
    }
  }

  addLearnerTurn(text) {
    this.learnerCount += 1;
    const turn = { role: 'learner', text, at: Date.now(), index: this.learnerCount };
    this.record.turns.push(turn);
    return turn;
  }

  async learnerTurn(text) {
    const turn = this.addLearnerTurn(text);
    ui.state('thinking');
    ui.tip('');
    ui.error('');

    // Cevap ve düzeltme paralel istenir; düzeltme sohbeti hiç bekletmez.
    const [reply, review] = await Promise.allSettled([
      partnerTurn(this.llm, settings, this.profile, this.record.turns, this.material),
      analyzeUtterance(this.llm, settings, this.lastPartner, text),
    ]);
    if (review.status === 'fulfilled') {
      turn.issues = review.value.issues;
      turn.natural = review.value.natural;
    } else {
      console.warn('Koç yanıt vermedi:', review.reason);
    }
    this.save();
    if (this.endRequested) return;

    if (reply.status === 'rejected') {
      await this.handleApiError(reply.reason);
      return;
    }
    this.failures = 0;
    const { lookup } = reply.value;
    const pausedByButton = () => this.paused && this.pausedByButton;

    // Canlı bilgi gerekiyorsa arama hemen başlar; ipucu ve "bakıyorum" cümlesi okunurken sonuç gelir.
    const answer = lookup ? this.lookupAndAnswer(lookup) : null;
    answer?.catch(() => {}); // hata aşağıda await edilince ele alınır

    const tips = pausedByButton() ? [] : this.tipsDue(turn);
    if (tips.length) {
      ui.tip(tips.map((i) => `${i.original} → ${i.better}`).join('  ·  '));
      const speech = issuesToSpeech(tips);
      await this.say(settings.feedbackMode === 'instant'
        ? `Quick tip. ${speech}`
        : `Quick feedback. ${speech} Okay, back to our chat.`);
      if (this.endRequested) return;
    }
    if (!answer) {
      await this.partnerSays(null, reply.value.text);
      return;
    }

    const bridge = reply.value.text || 'Let me check that for you.';
    ui.partner(bridge);
    if (!pausedByButton()) await this.say(bridge);
    if (this.endRequested) return;
    ui.state('thinking', `${LOOKUP_LABELS[lookup.kind]} kontrol ediliyor`);
    let answerText;
    try {
      answerText = await answer;
    } catch (err) {
      await this.handleApiError(err);
      return;
    }
    if (this.endRequested) return;
    await this.partnerSays(null, answerText, { lookup });
  }

  // Bilgiyi telefondan arar, sonra Sam'e bulunanla cevap yazdırır.
  async lookupAndAnswer(lookup) {
    let found;
    try {
      found = await lookUp(lookup, settings);
    } catch (err) {
      console.warn('Arama başarısız:', err);
      found = {
        source: LOOKUP_LABELS[lookup.kind],
        text: `The lookup failed (${err.message}). Tell the learner you couldn't check that right now, then continue the conversation.`,
      };
    }
    return partnerAnswer(this.llm, settings, this.profile, this.record.turns, found, this.material);
  }

  async partnerSays(kind, text = null, extra = {}) {
    if (!text) {
      ui.state('thinking');
      try {
        text = await partnerOpener(this.llm, settings, this.profile, this.record.turns, kind, this.material);
      } catch (err) {
        await this.handleApiError(err);
        return;
      }
    }
    this.lastPartner = text;
    this.record.turns.push({ role: 'partner', text, at: Date.now(), ...extra });
    this.save();
    ui.partner(text);
    // Düğmeyle duraklatıldıysa cevabı şimdi okuma; devam edince okunur.
    if (!(this.paused && this.pausedByButton)) await this.say(text);
  }

  async say(text) {
    ui.state('speaking');
    await speaker.speak(text);
  }

  allIssues() {
    return this.record.turns.flatMap((t) => t.issues || []);
  }

  learnerSentences() {
    return this.record.turns.filter((t) => t.role === 'learner').map((t) => t.natural || t.text);
  }

  // Henüz söylenmemiş, en az minSeverity önemindeki en fazla n hatayı seçip "söylendi" işaretler.
  take(issues, n, minSeverity) {
    const picked = issues
      .filter((i) => !i.reported && i.severity >= minSeverity)
      .sort((a, b) => b.severity - a.severity)
      .slice(0, n);
    for (const issue of picked) issue.reported = true;
    return picked;
  }

  tipsDue(turn) {
    if (settings.feedbackMode === 'instant') return this.take(turn?.issues || [], 1, 2);
    if (settings.feedbackMode === 'periodic' && turn?.index && turn.index % Math.max(2, settings.feedbackEvery) === 0) {
      return this.take(this.allIssues(), 2, 2);
    }
    return [];
  }

  async runCommand(command) {
    switch (command) {
      case 'feedback': {
        const items = this.take(this.allIssues(), 3, 1);
        if (items.length) {
          ui.tip(items.map((i) => `${i.original} → ${i.better}`).join('  ·  '));
          await this.say(`${issuesToSpeech(items)} Okay, let's continue. ${this.lastPartner}`);
        } else {
          await this.say(`I didn't notice any new mistakes. Well done! ${this.lastPartner}`);
        }
        break;
      }
      case 'quiz':
        await this.runQuiz();
        break;
      case 'repeat':
        await this.say(this.lastPartner || 'Tell me about your day.');
        break;
      case 'slower':
      case 'faster': {
        const delta = command === 'slower' ? -0.1 : 0.1;
        settings.rate = clamp(Math.round((settings.rate + delta) * 100) / 100, 0.6, 1.4);
        speaker.rate = settings.rate;
        saveSettings(settings);
        fillSettingsForm();
        await this.say(command === 'slower' ? 'Okay, I\'ll speak more slowly.' : 'Okay, I\'ll speak a bit faster.');
        break;
      }
      case 'newtopic':
        await this.partnerSays('newtopic');
        break;
      case 'pause':
        this.paused = true;
        this.pausedByButton = false;
        updatePauseButton();
        mediaKeys.setPaused(true);
        await this.say('Sure, I\'ll wait. Say "continue" when you\'re ready.');
        break;
      case 'end':
        this.endRequested = true;
        break;
      default:
        break;
    }
  }

  // Kelime testi: tekrar zamanı gelen ifadelerle cümle kurdurur, cevabı modele kontrol ettirir.
  async runQuiz({ intro = false } = {}) {
    let items = dueVocab(3);
    if (!items.length) items = shuffle(loadVocab()).slice(0, 3); // vadesi gelen yoksa rastgele tekrar
    const hello = intro ? 'Hi! ' : '';
    if (!items.length) {
      await this.say(`${hello}You don't have any saved phrases yet. I collect useful phrases at the end of each session. ${intro ? 'So let\'s just chat today.' : `Let's continue. ${this.lastPartner}`}`);
      return;
    }
    await this.say(`${hello}Vocabulary time! I'll give you ${items.length === 1 ? 'one phrase' : `${items.length} phrases`}. Make a sentence with each one.`);
    for (const item of items) {
      if (this.endRequested) return;
      ui.tip(item.tr ? `${item.en} – ${item.tr}` : item.en);
      await this.say(`Make a sentence with: ${item.en}.`);
      if (this.endRequested) return;
      ui.state('listening');
      let heard;
      try {
        heard = await this.listener.listenOnce({ onInterim: (t) => ui.interim(t) });
      } catch (err) {
        if (await this.handleListenError(err)) continue;
        return;
      }
      ui.interim('');
      if (this.endRequested || heard === null) return; // duraklatma ya da tuşla çıkış
      const answer = heard.trim();
      if (parseCommand(answer) === 'end') {
        this.endRequested = true;
        return;
      }
      if (!answer) {
        reviewVocab(item.en, false);
        await this.say(item.example ? `No problem. Here's an example: ${item.example}` : 'No problem, let\'s try the next one.');
        continue;
      }
      ui.state('thinking');
      let verdict = null;
      try {
        verdict = await judgeVocab(this.llm, settings, item, answer);
      } catch (err) {
        console.warn('Kelime kontrolü yapılamadı:', err);
      }
      if (!verdict) {
        await this.say('Sorry, I couldn\'t check that one. Let\'s move on.');
        continue;
      }
      reviewVocab(item.en, verdict.correct);
      (this.record.quiz ||= []).push({ phrase: item.en, answer, correct: verdict.correct });
      this.save();
      await this.say(verdict.feedback || (verdict.correct ? 'Correct!' : 'Not quite.'));
    }
    ui.tip('');
    await this.say(intro ? 'Nice work! Now let\'s chat.' : `Nice work! Okay, back to our chat. ${this.lastPartner}`);
  }

  async resume() {
    this.paused = false;
    this.pausedByButton = false;
    updatePauseButton();
    mediaKeys.setPaused(false);
    await this.say(`Welcome back. ${this.lastPartner}`);
  }

  togglePause() {
    if (this.endRequested) return;
    if (this.paused) {
      const waiter = this.resumeWaiter;
      this.paused = false;
      this.pausedByButton = false;
      this.resumeWaiter = null;
      this.announceResume = true;
      if (waiter) waiter();
      else this.listener.stop();
    } else {
      this.paused = true;
      this.pausedByButton = true;
      this.listener.stop();
      speaker.cancel();
    }
    updatePauseButton();
    mediaKeys.setPaused(this.paused);
  }

  // Ekrandaki daireye dokunma: konuşuyorsa atla, dinliyorsa duyduğunu hemen gönder.
  tapOrb() {
    if (ui.current === 'speaking') speaker.cancel();
    else if (ui.current === 'listening') this.listener.flush();
  }

  requestEnd() {
    if (this.finishing) {
      this.skipSummary = true;
      speaker.cancel();
      return;
    }
    this.endRequested = true;
    this.paused = false;
    this.pausedByButton = false;
    updatePauseButton();
    $('pauseBtn').disabled = true;
    $('endBtn').textContent = 'Hemen bitir';
    this.listener.stop();
    speaker.cancel();
    if (this.resumeWaiter) {
      const waiter = this.resumeWaiter;
      this.resumeWaiter = null;
      waiter();
    }
  }

  async handleListenError(err) {
    console.error(err);
    ui.error(err.message);
    if (err instanceof ListenError && err.kind === 'network' && this.failures < 3) {
      this.failures += 1;
      await this.say('I lost the internet connection. I\'ll keep trying.');
      await sleep(3000);
      return true;
    }
    this.endRequested = true;
    await this.say('I can\'t hear you, so let\'s stop here. Please check the microphone.');
    return false;
  }

  async handleApiError(err) {
    console.error(err);
    ui.error(err.message || String(err));
    if (err instanceof GeminiError && err.kind === 'auth') {
      this.endRequested = true;
      await this.say('There is a problem with the API key. Please check the settings when you stop the car.');
      return;
    }
    this.failures += 1;
    if (this.failures >= 4) {
      this.endRequested = true;
      await this.say('I keep having connection problems, so let\'s stop here for today.');
      return;
    }
    if (err.kind === 'rate') await this.say('I need a short break. Please say that again in a moment.');
    else if (err.kind === 'network') await this.say('I lost the internet connection. Please say that again.');
    else await this.say('Sorry, something went wrong. Could you say that again?');
  }

  async finish() {
    this.finishing = true;
    $('pauseBtn').disabled = true;
    $('endBtn').textContent = 'Hemen bitir';
    if (!this.learnerCount) {
      if (this.record.quiz?.length) {
        this.record.endedAt = new Date().toISOString();
        this.save();
      }
      return;
    }
    ui.state('summary', 'hemen bitirmek için Bitir\'e bas');
    ui.tip('');
    const issues = this.allIssues();
    let summary;
    try {
      summary = await summarizeSession(this.llm, settings, issues, this.learnerCount, this.learnerSentences());
    } catch (err) {
      console.warn('Özet alınamadı:', err);
      const top = [...issues].sort((a, b) => b.severity - a.severity).slice(0, 3);
      summary = {
        spoken: top.length
          ? `Good work today. Here are some things to remember. ${issuesToSpeech(top)}`
          : 'Great session! I didn\'t notice any important mistakes today. See you next time.',
        focus: [],
        focusTr: [],
        phrases: [],
      };
    }
    this.record.summary = summary;
    this.record.endedAt = new Date().toISOString();
    this.save();
    if (summary.focus.length) {
      mergeFocus(this.profile, summary.focus, summary.focusTr);
      saveProfile({ ...loadProfile(), focus: this.profile.focus });
      renderFocus();
    }
    if (summary.phrases.length) addVocab(summary.phrases);
    if (!this.skipSummary) await this.say(`${summary.spoken} Goodbye, and drive safely!`);
  }

  save() {
    if (this.learnerCount || this.record.quiz?.length) saveSession(this.record);
  }
}

// ---------- Canlı mod oturumu (Gemini Live: gerçek zamanlı, doğal ses) ----------
// Konuşma tanıma, cevap ve ses tek bağlantıda akar. Koç ve özet Klasik moddaki gibi ayrı
// metin çağrılarıyla çalışır; komutlar (geri bildirim, duraklat, bitir, test) modelin araçlarıdır.

class LiveSession extends Session {
  constructor({ llm }) {
    super({ llm, listener: null });
    this.record.mode = 'live';
    this.client = null;
    this.connected = false;
    this.learnerText = '';
    this.partnerText = '';
    this.pendingTips = [];
    this.pendingLookup = null;
    this.afterTurn = null; // model aracı istedi: cevabı bitince 'pause' ya da 'end'
    this.stopWaiting = null;
    this.coachJobs = new Set();
  }

  async run() {
    this.active = true;
    keepAwake(true);
    this.startMediaKeys();
    try {
      await this.loadMaterial();
      ui.state('thinking', 'Canlı moda bağlanıyor');
      this.client = new LiveClient({
        apiKey: settings.apiKey.trim(),
        model: settings.liveModel,
        voice: settings.liveVoice,
        system: liveSystem(settings, this.profile, this.material),
        tools: liveTools(settings),
        silenceMs: clamp(settings.graceMs, 600, 3000),
        bargeIn: settings.bargeIn,
        captureMic: !settings.typeMode,
        socketFactory: isDemo() ? () => new MockLiveSocket() : null,
      }, this.liveEvents());
      await this.client.start();
      this.connected = true;
      if (!this.endRequested) {
        ui.state('thinking');
        await this.client.request(liveOpener(settings, this.material));
      }
      if (!this.endRequested && !this.client.speaking) this.showIdle();
      await new Promise((resolve) => {
        this.stopWaiting = resolve;
        if (this.endRequested) resolve();
      });
      this.client.setMicMuted(true);
      this.commitLearner();
      await Promise.race([Promise.allSettled([...this.coachJobs]), sleep(5000)]); // son cümlenin düzeltmesi özete girsin
      await this.finish();
    } catch (err) {
      console.error(err);
      ui.error(err.message || String(err));
      if (!this.connected) this.fallback = err;
      this.save();
    } finally {
      this.client?.close();
      this.active = false;
      keepAwake(false);
      mediaKeys.stop();
      sessionEnded(this);
    }
  }

  liveEvents() {
    return {
      onLearnerText: (chunk) => {
        if (this.paused) return;
        this.learnerText += chunk;
        ui.interim(this.learnerText.trim());
      },
      onPartnerText: (chunk) => {
        this.commitLearner();
        this.partnerText += chunk;
        ui.partner(this.partnerText.trim());
      },
      onSpeaking: (speaking) => {
        if (speaking) ui.state('speaking');
        else if (!this.finishing) this.showIdle();
      },
      onInterrupted: () => this.commitPartner(true),
      onTurnComplete: () => {
        this.commitLearner();
        this.commitPartner(false);
        this.afterTurnComplete();
      },
      onToolCall: (calls) => this.handleToolCalls(calls),
      onReconnecting: (attempt) => {
        ui.state('thinking', 'yeniden bağlanıyor');
        ui.error(`Bağlantı koptu, yeniden bağlanılıyor (${attempt}).`);
      },
      onReconnected: (resumed) => {
        ui.error('');
        this.showIdle();
        if (!resumed) {
          const recent = this.record.turns.slice(-6).map((t) => `${t.role === 'partner' ? 'Sam' : 'Learner'}: ${t.text}`).join('\n');
          this.client.sendText(`[App] The connection dropped and was restored. The recent conversation was:\n${recent}\nBriefly say you're back and continue.`);
        }
      },
      onClosed: (err) => {
        ui.error(err.message);
        this.endRequested = true;
        this.stopWaiting?.();
      },
    };
  }

  showIdle() {
    if (this.paused) ui.state('paused', 'devam için dokun');
    else ui.state('listening', 'konuşabilirsin');
  }

  commitLearner() {
    const text = this.learnerText.replace(/\s+/g, ' ').trim();
    this.learnerText = '';
    ui.interim('');
    if (text) this.recordLearner(text);
  }

  // Cümleyi kaydeder ve koça arka planda inceletir; ipuçları Sam'in sırası bitince söylenir.
  recordLearner(text) {
    const turn = this.addLearnerTurn(text);
    this.save();
    const job = analyzeUtterance(this.llm, settings, this.lastPartner, text)
      .then((review) => {
        turn.issues = review.issues;
        turn.natural = review.natural;
        this.save();
        this.pendingTips.push(...this.tipsDue(turn));
      })
      .catch((err) => console.warn('Koç yanıt vermedi:', err))
      .finally(() => this.coachJobs.delete(job));
    this.coachJobs.add(job);
  }

  commitPartner(interrupted) {
    const text = this.partnerText.replace(/\s+/g, ' ').trim();
    this.partnerText = '';
    if (!text) return;
    this.lastPartner = text;
    const turn = { role: 'partner', text: interrupted ? `${text} …` : text, at: Date.now() };
    if (this.pendingLookup) {
      turn.lookup = this.pendingLookup;
      this.pendingLookup = null;
    }
    this.record.turns.push(turn);
    this.save();
  }

  async afterTurnComplete() {
    await this.client?.waitForIdle();
    if (!this.client || this.finishing) return;
    if (this.afterTurn === 'end') {
      this.afterTurn = null;
      this.endRequested = true;
      this.stopWaiting?.();
    } else if (this.afterTurn === 'pause') {
      this.afterTurn = null;
      this.enterPause();
    } else {
      this.deliverTips();
    }
  }

  deliverTips() {
    if (!this.pendingTips.length || this.paused || this.endRequested) return;
    const tips = this.pendingTips.splice(0);
    ui.tip(tips.map((i) => `${i.original} → ${i.better}`).join('  ·  '));
    const kind = settings.feedbackMode === 'instant' ? 'a quick tip' : 'quick feedback';
    this.client.sendText(`[App] Coach note: give the learner ${kind} now, kindly and in under 40 words: ${issuesToSpeech(tips)} Then continue the conversation naturally.`);
  }

  async handleToolCalls(calls) {
    const functionResponses = [];
    for (const call of calls) {
      let result;
      try {
        result = await this.runTool(call.name, call.args || {});
      } catch (err) {
        result = { error: err.message };
      }
      functionResponses.push({ id: call.id, name: call.name, response: { result } });
    }
    this.client?.sendToolResponse(functionResponses);
  }

  async runTool(name, args) {
    switch (name) {
      case 'get_weather': return this.lookupTool('weather', args.city);
      case 'search_news': return this.lookupTool('news', args.keywords);
      case 'search_wikipedia': return this.lookupTool('wikipedia', args.query);
      case 'get_exchange_rates': return this.lookupTool('currency', args.currencies);
      case 'give_feedback': {
        const items = this.take(this.allIssues(), 3, 1);
        if (!items.length) return { mistakes: [], note: 'No new mistakes. Praise the learner briefly and continue.' };
        ui.tip(items.map((i) => `${i.original} → ${i.better}`).join('  ·  '));
        return {
          mistakes: items.map((i) => ({ said: i.original, better: i.better, why: i.explanation })),
          note: 'Tell the learner these points briefly and kindly, then continue the conversation.',
        };
      }
      case 'vocabulary_quiz': {
        let items = dueVocab(4);
        if (!items.length) items = shuffle(loadVocab()).slice(0, 4);
        if (!items.length) return { phrases: [], note: 'The learner has no saved phrases yet; they are collected from session summaries. Say so briefly and keep chatting.' };
        return {
          phrases: items.map((i) => ({ phrase: i.en, meaning_tr: i.tr, example: i.example })),
          note: 'Ask the learner to make a sentence with each phrase, one at a time. After each answer, say briefly whether it was right (give a natural example if not) and call record_quiz_answer.',
        };
      }
      case 'record_quiz_answer': {
        const correct = args.correct === true || args.correct === 'true';
        const item = reviewVocab(args.phrase, correct);
        (this.record.quiz ||= []).push({ phrase: String(args.phrase || ''), correct });
        this.save();
        return item ? 'saved' : 'This phrase is not in the notebook; continue anyway.';
      }
      case 'pause_session':
        this.afterTurn = 'pause';
        return 'The app will pause after your reply. Just say a short "Sure, I\'ll wait."';
      case 'end_session':
        this.afterTurn = 'end';
        return 'The session will end after your reply. Say one short, friendly goodbye; the app will then read the summary.';
      default:
        return { error: `unknown function ${name}` };
    }
  }

  async lookupTool(kind, query = '') {
    ui.state('thinking', `${LOOKUP_LABELS[kind]} kontrol ediliyor`);
    this.pendingLookup = { kind, query: String(query || '').trim() };
    try {
      return (await lookUp(this.pendingLookup, settings)).text;
    } catch (err) {
      console.warn('Arama başarısız:', err);
      return `The lookup failed (${err.message}). Tell the learner you couldn't check that right now.`;
    }
  }

  // Yazarak test modu: metin doğrudan gönderilir (sesli girişin yazıya dökümü yerine).
  submitTyped(text) {
    if (!this.client || this.endRequested) return;
    if (this.paused) this.setPaused(false);
    this.commitLearner();
    this.recordLearner(text);
    this.client.sendText(text);
  }

  setPaused(paused) {
    this.paused = paused;
    this.pausedByButton = paused;
    this.client?.setMicMuted(paused);
    updatePauseButton();
    mediaKeys.setPaused(paused);
  }

  enterPause() {
    this.setPaused(true);
    this.learnerText = '';
    ui.interim('');
    ui.state('paused', 'devam için dokun');
  }

  resumeLive() {
    this.setPaused(false);
    ui.state('thinking');
    this.client?.sendText('[App] The learner is back. Welcome them back in a few words and continue where you left off.');
  }

  togglePause() {
    if (this.endRequested || !this.client) return;
    if (this.paused) {
      this.resumeLive();
    } else {
      this.client.skipCurrent();
      this.enterPause();
    }
  }

  tapOrb() {
    if (this.paused) this.resumeLive();
    else if (this.client?.speaking) this.client.skipCurrent();
  }

  mediaNext() {
    if (this.paused || !this.client || this.endRequested) return;
    this.client.skipCurrent();
    this.client.sendText('[App] The learner pressed the "next" button: move on to a new topic or the next item now.');
  }

  mediaPrevious() {
    if (this.paused || !this.client || this.endRequested) return;
    this.client.skipCurrent();
    this.client.sendText('[App] The learner pressed the "back" button: repeat what you just said, a little more slowly.');
  }

  requestEnd() {
    if (this.finishing) {
      this.skipSummary = true;
      this.client?.skipCurrent();
      this.client?.cancelRequests();
      speaker.cancel();
      return;
    }
    this.endRequested = true;
    this.paused = false;
    this.pausedByButton = false;
    updatePauseButton();
    $('pauseBtn').disabled = true;
    $('endBtn').textContent = 'Hemen bitir';
    this.client?.setMicMuted(true);
    this.client?.skipCurrent();
    this.client?.cancelRequests();
    this.stopWaiting?.();
  }

  // Özet gibi uygulamanın söyleteceği metinler Sam'in kendi sesiyle okunur; bağlantı yoksa telefonun sesiyle.
  async say(text) {
    if (this.client?.ready) {
      ui.state('speaking');
      await this.client.request(`[App] Say this to the learner in a warm, natural voice, without adding anything: "${text}"`);
    } else {
      await super.say(text);
    }
  }
}

function updatePauseButton() {
  $('pauseBtn').textContent = session?.paused ? 'Devam et' : 'Duraklat';
}

const liveSelected = () => settings.voiceMode === 'live';

function setupProblems(live = liveSelected()) {
  const problems = [];
  if (!window.isSecureContext) problems.push('Mikrofon için sayfa https:// ya da localhost üzerinden açılmalı.');
  if (live) {
    if (!settings.typeMode && !(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode)) {
      problems.push('Bu tarayıcı Canlı modu desteklemiyor; Klasik moda geç.');
    }
  } else {
    if (!synthesisSupported) problems.push('Bu tarayıcı sesli okumayı desteklemiyor.');
    if (!settings.typeMode && !recognitionSupported) problems.push('Bu tarayıcı konuşma tanımayı desteklemiyor. Android\'de Google Chrome ile aç.');
  }
  if (!isDemo() && !settings.apiKey.trim()) problems.push('Önce Ayarlar\'dan Gemini API anahtarını gir (ya da Ayarlar → Gelişmiş → Demo modu).');
  return problems;
}

const MODE_HINTS = {
  classic: 'Klasik: telefonun sesi ve konuşma tanıması.',
  live: 'Canlı: Sam doğal bir sesle anında cevap verir, sözünü kesebilirsin. Açılamazsa Klasik moda geçer.',
};

function refreshSetup() {
  const problems = setupProblems();
  $('setupWarning').hidden = !problems.length;
  $('setupWarning').textContent = problems.join(' ');
  $('startBtn').disabled = problems.length > 0;
  $('demoBadge').hidden = !isDemo();
  $('modeSelect').value = settings.voiceMode;
  $('modeHint').textContent = MODE_HINTS[settings.voiceMode] || '';
}

function startSession({ forceClassic = false } = {}) {
  const live = liveSelected() && !forceClassic;
  if (session?.active || setupProblems(live).length) return;
  speaker.rate = settings.rate;
  speaker.voiceURI = settings.voiceURI;
  const llm = isDemo() ? createMockGemini() : createGemini(settings.apiKey.trim());
  if (live) {
    session = new LiveSession({ llm });
  } else {
    const listener = settings.typeMode ? new TypedListener() : new Listener({ graceMs: settings.graceMs });
    session = new Session({ llm, listener });
  }

  $('setup').hidden = true;
  $('live').hidden = false;
  $('typeForm').hidden = !settings.typeMode;
  ui.partner('');
  ui.interim('');
  ui.tip('');
  ui.error('');
  updatePauseButton();
  $('pauseBtn').disabled = false;
  $('endBtn').textContent = 'Bitir';
  session.run();
}

function sessionEnded(ended) {
  $('live').hidden = true;
  $('setup').hidden = false;
  ui.state('idle');
  refreshSetup();
  // Canlı mod açılamadıysa (kota, ağ, model adı) aynı ayarlarla Klasik modda başla.
  const fallback = ended.fallback;
  if (fallback && !['auth', 'mic'].includes(fallback.kind) && !setupProblems(false).length) {
    startSession({ forceClassic: true });
    ui.error(`Canlı mod açılamadı (${fallback.message}) Klasik modla devam ediliyor.`);
    return;
  }
  // Oturum hiç başlayamadıysa (ör. geçersiz anahtar) hatayı kurulum ekranında göster.
  const lastError = $('errorLine').textContent;
  if (lastError && !ended.learnerCount) {
    $('setupWarning').hidden = false;
    $('setupWarning').textContent = lastError;
  }
  if (ended.learnerCount || ended.record.quiz?.length) {
    showView('history');
    renderSessionDetail(loadSessions().find((s) => s.id === ended.record.id) || ended.record);
  }
}

// ---------- Kurulum ekranı ----------

function renderTopics() {
  const chip = (topic) => el('button', {
    type: 'button',
    class: `chip${!settings.customTopic && settings.topic === topic.id ? ' selected' : ''}`,
    onclick: () => {
      settings.topic = topic.id;
      settings.customTopic = '';
      $('customTopic').value = '';
      saveSettings(settings);
      renderTopics();
    },
  }, topic.label);
  $('topicChips').replaceChildren(...TOPIC_GROUPS.flatMap(([group, label]) => [
    el('p', { class: 'chip-group' }, label),
    el('div', { class: 'chips' }, TOPICS.filter((t) => t.group === group).map(chip)),
  ]));
}

$('customTopic').value = settings.customTopic;
$('customTopic').addEventListener('input', (e) => {
  settings.customTopic = e.target.value;
  saveSettings(settings);
  renderTopics();
});
$('levelSelect').value = settings.level;
$('levelSelect').addEventListener('change', (e) => { settings.level = e.target.value; saveSettings(settings); });
$('feedbackSelect').value = settings.feedbackMode;
$('feedbackSelect').addEventListener('change', (e) => { settings.feedbackMode = e.target.value; saveSettings(settings); });
$('modeSelect').addEventListener('change', (e) => {
  settings.voiceMode = e.target.value;
  saveSettings(settings);
  fillSettingsForm();
  refreshSetup();
});

$('startBtn').addEventListener('click', () => startSession());
$('endBtn').addEventListener('click', () => session?.requestEnd());
$('pauseBtn').addEventListener('click', () => session?.togglePause());
$('orb').addEventListener('click', () => session?.tapOrb());
$('typeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('typeInput').value.trim();
  if (!text || !session?.active) return;
  $('typeInput').value = '';
  if (session instanceof LiveSession) session.submitTyped(text);
  else if (session.listener instanceof TypedListener) session.listener.submit(text);
});

// ---------- Sekmeler ----------

function showView(name) {
  for (const view of document.querySelectorAll('.view')) view.classList.toggle('active', view.id === `view-${name}`);
  for (const tab of document.querySelectorAll('.tabs button')) tab.classList.toggle('active', tab.dataset.view === name);
  if (name === 'history') renderHistory();
  if (name === 'progress') renderProgress();
  if (name === 'talk') refreshSetup();
}
for (const tab of document.querySelectorAll('.tabs button')) {
  tab.addEventListener('click', () => showView(tab.dataset.view));
}

// ---------- Geçmiş ----------

const formatDate = (iso) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });

function sessionMinutes(s) {
  const end = s.endedAt ? Date.parse(s.endedAt) : (s.turns.at(-1)?.at || Date.parse(s.startedAt));
  return Math.max(1, Math.round((end - Date.parse(s.startedAt)) / 60000));
}

function sessionStats(s) {
  const learner = s.turns.filter((t) => t.role === 'learner').length;
  const issues = s.turns.reduce((n, t) => n + (t.issues?.length || 0), 0);
  return { learner, issues, minutes: s.endedAt ? sessionMinutes(s) : null };
}

function renderHistory() {
  $('sessionDetail').hidden = true;
  const list = $('historyList');
  list.hidden = false;
  const sessions = loadSessions();
  if (!sessions.length) {
    list.replaceChildren(el('p', { class: 'empty' }, 'Henüz oturum yok. İlk sohbetinden sonra düzeltmelerin burada görünecek.'));
    return;
  }
  list.replaceChildren(...sessions.map((s) => {
    const { learner, issues, minutes } = sessionStats(s);
    return el('button', { type: 'button', class: 'session-card', onclick: () => renderSessionDetail(s) },
      el('div', {}, el('b', {}, s.topic), ` · ${s.level}`, s.mode === 'live' ? el('span', { class: 'mode-tag' }, 'Canlı') : null),
      el('div', { class: 'meta' }, `${formatDate(s.startedAt)}${minutes ? ` · ${minutes} dk` : ''} · ${learner} cümle · ${issues} düzeltme`));
  }));
}

function issueCard(issue) {
  return el('div', { class: `issue sev-${issue.severity}` },
    el('div', {}, el('span', { class: 'from' }, issue.original), '  →  ', el('span', { class: 'to' }, issue.better)),
    el('div', { class: 'why' }, issue.explanation_tr || ''),
    el('div', { class: 'why' }, issue.explanation || ''));
}

function renderSessionDetail(s) {
  $('historyList').hidden = true;
  const box = $('sessionDetail');
  box.hidden = false;
  const issues = s.turns.flatMap((t) => t.issues || []).sort((a, b) => b.severity - a.severity);
  const summary = s.summary;
  const phrases = summary?.phrases || [];

  box.replaceChildren(el('div', { class: 'detail' },
    el('button', { type: 'button', onclick: renderHistory }, '← Geri'),
    el('h2', {}, `${s.topic} · ${formatDate(s.startedAt)}`),
    summary && el('div', { class: 'summary-box' },
      el('p', {}, summary.spoken),
      summary.focusTr?.length ? el('div', { class: 'focus-chips' }, summary.focusTr.map((f) => el('span', {}, f))) : null),
    phrases.length ? [
      el('h2', {}, 'Yeni ifadeler (kelime defterine eklendi)'),
      el('ul', { class: 'phrase-list' }, phrases.map((p) => el('li', {}, el('b', {}, p.en), p.tr ? ` – ${p.tr}` : '', p.example ? el('div', { class: 'vocab-example' }, p.example) : null))),
    ] : null,
    s.quiz?.length ? [
      el('h2', {}, 'Kelime testi'),
      el('ul', { class: 'phrase-list' }, s.quiz.map((q) => el('li', {}, q.correct ? '✓ ' : '✗ ', el('b', {}, q.phrase), q.answer ? ` – "${q.answer}"` : ''))),
    ] : null,
    el('h2', {}, `Düzeltmeler (${issues.length})`),
    issues.length ? issues.map(issueCard) : el('p', { class: 'empty' }, 'Bu oturumda düzeltme yok.'),
    el('h2', {}, 'Konuşma'),
    el('div', { class: 'transcript' }, s.turns.flatMap((t) => {
      const line = el('p', {}, el('span', { class: 'who' }, t.role === 'partner' ? 'Sam: ' : 'Sen: '), t.text);
      const showNatural = t.natural && t.natural.trim().toLowerCase() !== t.text.trim().toLowerCase();
      if (t.lookup) {
        const label = LOOKUP_LABELS[t.lookup.kind] || t.lookup.kind;
        return [el('p', { class: 'lookup' }, `🔎 ${label}${t.lookup.query ? `: ${t.lookup.query}` : ''}`), line];
      }
      return showNatural ? [line, el('p', { class: 'natural' }, `✓ ${t.natural}`)] : [line];
    }))));
  box.scrollIntoView({ block: 'start' });
}

// ---------- İlerleme ve kelime defteri ----------

const CATEGORY_LABELS = { grammar: 'Dilbilgisi', vocabulary: 'Kelime seçimi', naturalness: 'Doğallık' };
const dayKey = (time) => new Date(time).toLocaleDateString('en-CA');
const shortDate = (time) => new Date(time).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

function weekStart(time) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // pazartesi
  return d.getTime();
}

function computeStats(sessions) {
  const weeks = [];
  for (let start = weekStart(Date.now()), i = 0; i < 8; i++, start = weekStart(start - 1)) {
    weeks.unshift({ start, minutes: 0, sentences: 0, issues: 0 });
  }
  const days = new Set();
  const categories = { grammar: 0, vocabulary: 0, naturalness: 0 };
  const monthAgo = Date.now() - 30 * DAY_MS;
  let minutes = 0;
  let sentences = 0;
  for (const s of sessions) {
    const started = Date.parse(s.startedAt);
    const learner = s.turns.filter((t) => t.role === 'learner');
    const issues = learner.flatMap((t) => t.issues || []);
    const mins = sessionMinutes(s);
    days.add(dayKey(started));
    minutes += mins;
    sentences += learner.length;
    const week = weeks.find((w) => w.start === weekStart(started));
    if (week) {
      week.minutes += mins;
      week.sentences += learner.length;
      week.issues += issues.length;
    }
    if (started >= monthAgo) for (const issue of issues) if (issue.category in categories) categories[issue.category] += 1;
  }
  // Seri: bugün henüz pratik yapılmadıysa dünden geriye sayılır.
  let streak = 0;
  const day = new Date();
  if (!days.has(dayKey(day))) day.setDate(day.getDate() - 1);
  while (days.has(dayKey(day))) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  const rate = (list) => {
    const n = list.reduce((sum, w) => sum + w.sentences, 0);
    return n ? (list.reduce((sum, w) => sum + w.issues, 0) / n) * 10 : null;
  };
  return { weeks, minutes, sentences, count: sessions.length, streak, categories, recentRate: rate(weeks.slice(4)), earlierRate: rate(weeks.slice(0, 4)) };
}

function tile(value, label, sub) {
  return el('div', { class: 'tile' },
    el('div', { class: 'tile-value' }, value),
    el('div', { class: 'tile-label' }, label),
    sub ? el('div', { class: 'tile-sub' }, sub) : null);
}

function minutesChart(weeks) {
  const max = Math.max(...weeks.map((w) => w.minutes), 1);
  const readout = el('p', { class: 'chart-readout', 'aria-live': 'polite' });
  const show = (w, button) => {
    readout.textContent = `${shortDate(w.start)} haftası: ${w.minutes} dk · ${w.sentences} cümle`;
    for (const b of button.parentElement.children) b.classList.toggle('active', b === button);
  };
  const bars = weeks.map((w) => {
    const button = el('button', {
      type: 'button',
      class: 'bar-col',
      'aria-label': `${shortDate(w.start)} haftası: ${w.minutes} dakika`,
      onclick: () => show(w, button),
      onmouseenter: () => show(w, button),
      onfocus: () => show(w, button),
    },
    el('span', { class: 'bar-track' }, w.minutes ? el('span', { class: 'bar', style: `height:${(w.minutes / max) * 100}%` }) : null),
    el('span', { class: 'bar-label' }, shortDate(w.start)));
    return button;
  });
  const chart = el('div', { class: 'bars', role: 'group', 'aria-label': 'Son 8 haftada haftalık konuşma süresi' }, bars);
  show(weeks.at(-1), bars.at(-1));
  return [chart, readout];
}

function categoryBars(categories) {
  const entries = Object.entries(categories);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  return el('div', { class: 'hbars' }, entries.map(([key, n]) => el('div', { class: 'hbar-row' },
    el('span', { class: 'hbar-label' }, CATEGORY_LABELS[key]),
    el('span', { class: 'hbar-track' }, n ? el('span', { class: 'hbar', style: `width:${(n / max) * 100}%` }) : null),
    el('span', { class: 'hbar-value' }, String(n)))));
}

function vocabItem(v) {
  const dots = Array.from({ length: MAX_BOX }, (_, i) => (i < v.box ? '●' : '○')).join('');
  const days = Math.ceil((v.due - Date.now()) / DAY_MS);
  const when = v.box >= LEARNED_BOX ? 'öğrenildi' : (days <= 0 ? 'tekrar zamanı' : `${days} gün sonra tekrar`);
  return el('li', {},
    el('div', { class: 'vocab-text' },
      el('div', {}, el('b', {}, v.en), v.tr ? ` – ${v.tr}` : ''),
      v.example ? el('div', { class: 'vocab-example' }, v.example) : null,
      el('div', { class: 'vocab-meta' }, el('span', { class: 'dots', title: `Kutu ${v.box}/${MAX_BOX}` }, dots), ` ${when}`)),
    el('button', {
      type: 'button',
      class: 'vocab-remove',
      'aria-label': `${v.en} ifadesini sil`,
      onclick: () => { removeVocab(v.id); renderProgress(); },
    }, '×'));
}

function renderProgress() {
  const stats = computeStats(loadSessions());
  const vocab = loadVocab();
  const learned = vocab.filter((v) => v.box >= LEARNED_BOX).length;
  const due = vocab.filter((v) => v.due <= Date.now()).length;
  const fmt = (n) => (n == null ? '–' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1 }));
  let trend = '';
  if (stats.recentRate != null && stats.earlierRate != null) {
    trend = stats.recentRate < stats.earlierRate ? ' (azalıyor, harika!)' : stats.recentRate > stats.earlierRate ? ' (artıyor)' : '';
  }

  $('progressStats').replaceChildren(
    el('div', { class: 'tiles' },
      tile(`${stats.weeks.at(-1).minutes} dk`, 'Bu hafta', `toplam ${stats.minutes} dk`),
      tile(`${stats.streak} gün`, 'Seri', stats.streak ? 'art arda pratik' : 'bugün başla!'),
      tile(String(stats.sentences), 'Cümle', `${stats.count} oturumda`),
      tile(`${learned}/${vocab.length}`, 'Öğrenilen ifade', due ? `${due} tanesi tekrar bekliyor` : null)),
    el('h2', {}, 'Haftalık konuşma süresi (dk)'),
    ...minutesChart(stats.weeks),
    el('h2', {}, 'Hata oranı'),
    el('p', { class: 'muted' }, `10 cümlede ortalama düzeltme: son 4 hafta ${fmt(stats.recentRate)}, önceki 4 hafta ${fmt(stats.earlierRate)}${trend}`),
    el('h2', {}, 'Hata türleri (son 30 gün)'),
    categoryBars(stats.categories),
  );
  $('vocabCount').textContent = vocab.length ? `(${vocab.length})` : '';
  $('vocabList').replaceChildren(...(vocab.length
    ? vocab.map(vocabItem)
    : [el('li', { class: 'empty-item' }, 'Henüz ifade yok. Oturum özetlerinden otomatik dolar; aşağıdan kendin de ekleyebilirsin.')]));
}

$('vocabForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const en = $('vocabEn').value.trim();
  if (!en) return;
  addVocab([{ en, tr: $('vocabTr').value.trim() }], 'manual');
  $('vocabEn').value = '';
  $('vocabTr').value = '';
  renderProgress();
});

// ---------- Ayarlar ----------

const form = $('settingsForm');

function fillVoices() {
  const select = $('voiceSelect');
  const voices = speaker.voices();
  select.replaceChildren(
    el('option', { value: '' }, 'Otomatik'),
    ...voices.map((v) => el('option', { value: v.voiceURI }, `${v.name} (${v.lang})`)),
  );
  select.value = voices.some((v) => v.voiceURI === settings.voiceURI) ? settings.voiceURI : '';
}

$('liveVoiceSelect').replaceChildren(...LIVE_VOICES.map(([value, label]) => el('option', { value }, label)));

function fillSettingsForm() {
  for (const input of form.elements) {
    if (!input.name || !(input.name in settings)) continue;
    if (input.type === 'checkbox') input.checked = Boolean(settings[input.name]);
    else input.value = settings[input.name];
  }
  $('rateOut').textContent = `${Number(settings.rate).toFixed(2)}×`;
  $('graceOut').textContent = `${(settings.graceMs / 1000).toFixed(2)} sn`;
}

let savedTimer = 0;
form.addEventListener('input', (e) => {
  const input = e.target;
  if (!input.name || !(input.name in settings)) return;
  if (input.type === 'number' && input.value === '') return; // yazarken boş kalınca 0'a çevirme
  if (input.type === 'checkbox') settings[input.name] = input.checked;
  else if (input.type === 'range' || input.type === 'number') settings[input.name] = Number(input.value);
  else settings[input.name] = input.value;
  speaker.rate = settings.rate;
  speaker.voiceURI = settings.voiceURI;
  saveSettings(settings);
  fillSettingsForm();
  refreshSetup();
  $('settingsSaved').textContent = 'Kaydedildi';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $('settingsSaved').textContent = ''; }, 1500);
});
form.addEventListener('submit', (e) => e.preventDefault());

$('toggleKey').addEventListener('click', () => {
  const input = $('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
  $('toggleKey').textContent = input.type === 'password' ? 'Göster' : 'Gizle';
});

// Kutu işaretlenince izin penceresi hemen (park halindeyken) açılsın.
$('useLocation').addEventListener('change', async (e) => {
  if (!e.target.checked) {
    $('locationNote').textContent = '';
    return;
  }
  $('locationNote').textContent = 'Konum alınıyor…';
  try {
    await currentPosition();
    $('locationNote').textContent = 'Konum izni verildi.';
  } catch (err) {
    settings.useLocation = false;
    saveSettings(settings);
    fillSettingsForm();
    $('locationNote').textContent = `${err.message} Hava durumu için Şehrin alanı kullanılacak.`;
  }
});

$('testVoice').addEventListener('click', () => {
  speaker.rate = settings.rate;
  speaker.voiceURI = settings.voiceURI;
  speaker.speak('Hi! This is how I sound. Let\'s practise some English together.');
});

function renderFocus() {
  const focus = loadProfile().focus;
  $('focusList').replaceChildren(...(focus.length
    ? focus.map((f) => el('li', {}, f.tr ? `${f.tr} (${f.en})` : f.en))
    : [el('li', {}, 'Henüz yok — oturum özetlerinden otomatik dolar.')]));
}

$('clearFocus').addEventListener('click', () => {
  saveProfile({ ...loadProfile(), focus: [] });
  renderFocus();
});

$('exportData').addEventListener('click', () => {
  const data = { exportedAt: new Date().toISOString(), profile: loadProfile(), vocab: loadVocab(), sessions: loadSessions() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  el('a', { href: url, download: `drivetalk-${new Date().toISOString().slice(0, 10)}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('clearHistory').addEventListener('click', () => {
  if (confirm('Tüm oturum geçmişi bu cihazdan silinsin mi? (Kelime defteri kalır.)')) {
    clearSessions();
    renderHistory();
  }
});

// ---------- Başlangıç ----------

renderTopics();
fillVoices();
speaker.onVoicesChanged(fillVoices);
fillSettingsForm();
renderFocus();
refreshSetup();
ui.state('idle');

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker kaydedilemedi:', err));
}
