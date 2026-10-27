// Konuşma tanıma (Chrome Web Speech API) ve sesli okuma (speechSynthesis).
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const recognitionSupported = Boolean(Recognition);
export const synthesisSupported = 'speechSynthesis' in window;

export class ListenError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'permission' | 'network' | 'mic'
  }
}

const joinText = (a, b) => [a, b].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

// Öğrencinin bir konuşma sırasını dinler. Android'de tanıma her sessizlikte kendiliğinden
// durduğu için sürekli yeniden başlatılır; cümle ortasında düşünmek için durursa
// graceMs boyunca devam etmesi beklenir, sonra metin tek parça olarak döner.
export class Listener {
  constructor({ lang = 'en-US', graceMs = 1500 } = {}) {
    this.lang = lang;
    this.graceMs = graceMs;
    this.job = null;
  }

  // Söylenen metni döndürür; silenceMs boyunca hiç konuşulmazsa '' döner, stop() ile null.
  listenOnce({ onInterim = () => {}, silenceMs = 45000 } = {}) {
    this.stop();
    return new Promise((resolve, reject) => {
      const job = { done: false };
      this.job = job;
      let buffer = '';
      let heardNow = '';
      let rec = null;
      let graceTimer = 0;
      let silenceTimer = 0;
      let restartTimer = 0;
      let quickFails = 0;

      const finish = (value, error) => {
        if (job.done) return;
        job.done = true;
        clearTimeout(graceTimer);
        clearTimeout(silenceTimer);
        clearTimeout(restartTimer);
        if (rec) {
          rec.onresult = rec.onerror = rec.onend = null;
          try { rec.abort(); } catch { /* zaten durmuş */ }
        }
        if (this.job === job) this.job = null;
        if (error) reject(error);
        else resolve(value);
      };

      job.cancel = () => finish(null);
      job.flush = () => finish(joinText(buffer, heardNow) || null);

      const armSilence = () => {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => { if (!buffer && !heardNow) finish(''); }, silenceMs);
      };

      const start = () => {
        if (job.done) return;
        const startedAt = Date.now();
        let segment = '';
        rec = new Recognition();
        rec.lang = this.lang;
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (event) => {
          let finalText = '';
          let interim = '';
          for (const result of event.results) {
            if (result.isFinal) finalText += result[0].transcript;
            else interim += result[0].transcript;
          }
          segment = finalText.trim();
          heardNow = joinText(segment, interim);
          if (heardNow) {
            clearTimeout(graceTimer);
            armSilence();
            quickFails = 0;
          }
          onInterim(joinText(buffer, heardNow));
        };

        rec.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            finish(null, new ListenError('permission', 'Mikrofon izni verilmedi.'));
          } else if (event.error === 'network') {
            finish(null, new ListenError('network', 'Konuşma tanıma için internet bağlantısı gerekiyor.'));
          } else if (event.error === 'audio-capture') {
            finish(null, new ListenError('mic', 'Mikrofona erişilemiyor.'));
          }
          // 'no-speech', 'aborted', 'no-match': onend ile yeniden başlatılır.
        };

        rec.onend = () => {
          if (job.done) return;
          // Bazı Android sürümleri son sonucu "final" işaretlemeden bitiriyor; ara metni de say.
          const got = segment || heardNow;
          if (got) {
            buffer = joinText(buffer, got);
            heardNow = '';
            clearTimeout(graceTimer);
            if (this.graceMs <= 0) { finish(buffer); return; }
            graceTimer = setTimeout(() => finish(buffer), this.graceMs);
          } else if (Date.now() - startedAt < 600) {
            quickFails += 1; // mikrofon meşgulse sıkı döngüye girmemek için yavaşla
          }
          restartTimer = setTimeout(start, Math.min(2000, 100 + quickFails * 300));
        };

        try {
          rec.start();
        } catch {
          quickFails += 1;
          restartTimer = setTimeout(start, 400);
        }
      };

      armSilence();
      start();
    });
  }

  // Şu ana kadar duyulanı hemen gönder (ekrandaki daireye dokununca).
  flush() { this.job?.flush(); }

  stop() { this.job?.cancel(); }
}

// Mikrofon yerine klavyeyle test etmek için aynı arayüz.
// Dinleme sırası gelmeden yazılan metin kaybolmasın diye kuyrukta bekletilir.
export class TypedListener {
  constructor() {
    this.pending = null;
    this.queue = [];
  }

  listenOnce() {
    this.stop();
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve) => { this.pending = resolve; });
  }

  submit(text) {
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve(text);
    } else if (text != null) {
      this.queue.push(text);
    }
  }

  flush() {}

  stop() {
    const resolve = this.pending;
    this.pending = null;
    resolve?.(null);
  }
}

// Uzun metni cümlelere böler; Chrome uzun tek parça metinlerde bazen yarıda kesiliyor.
function splitSentences(text) {
  const parts = text.match(/[^.!?]+[.!?]*["')\]]*\s*/g) || [text];
  const chunks = [];
  for (const part of parts) {
    const last = chunks.length - 1;
    if (last >= 0 && chunks[last].length + part.length < 160) chunks[last] += part;
    else chunks.push(part);
  }
  return chunks.map((c) => c.trim()).filter(Boolean);
}

export class Speaker {
  constructor() {
    this.voiceURI = '';
    this.rate = 1;
    this.token = 0;
    this.held = new Set(); // Chrome, referansı tutulmayan utterance'ların onend'ini kaçırabiliyor
    this.speaking = false;
    this.lastWordAt = 0; // ağız animasyonu için son kelime sınırı
  }

  voices() {
    if (!synthesisSupported) return [];
    return speechSynthesis.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
  }

  onVoicesChanged(callback) {
    if (synthesisSupported) speechSynthesis.addEventListener('voiceschanged', callback);
  }

  pickVoice() {
    const list = this.voices();
    return list.find((v) => v.voiceURI === this.voiceURI)
      || list.find((v) => /en[-_]US/i.test(v.lang) && v.localService)
      || list.find((v) => /en[-_]US/i.test(v.lang))
      || list[0]
      || null;
  }

  async speak(text) {
    if (!synthesisSupported || !text) return;
    const token = ++this.token;
    this.speaking = true;
    try {
      for (const chunk of splitSentences(text)) {
        if (token !== this.token) return;
        await this.speakChunk(chunk);
      }
    } finally {
      if (token === this.token) this.speaking = false;
    }
  }

  speakChunk(text) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = this.pickVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = this.rate;
      this.held.add(utterance);

      // onend hiç gelmezse takılıp kalmamak için süreye dayalı emniyet.
      const words = text.split(/\s+/).length;
      const safety = setTimeout(done, 4000 + (words * 700) / this.rate);
      function done() {
        clearTimeout(safety);
        utterance.onend = utterance.onerror = null;
        resolve();
      }
      utterance.onboundary = () => { this.lastWordAt = performance.now(); };
      utterance.onend = () => { this.held.delete(utterance); done(); };
      utterance.onerror = () => { this.held.delete(utterance); done(); };
      speechSynthesis.speak(utterance);
    });
  }

  cancel() {
    this.token += 1;
    this.speaking = false;
    if (synthesisSupported) speechSynthesis.cancel();
  }
}
