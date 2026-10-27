// Gemini Live API istemcisi (gerçek zamanlı sesli sohbet). Mikrofon sesi WebSocket üzerinden
// akar, Sam'in sesi geldikçe çalınır. Bağlantı ~10 dakikada bir yenilenir; oturum
// "session resumption" ile kaldığı yerden sürer, uzun sohbetler için bağlam sıkıştırılır.
import { micConstraints } from './devices.js';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const SETUP_TIMEOUT_MS = 15000;
const MAX_RECONNECTS = 5;
const START_BUFFER_S = 0.15; // her cevabın başında küçük tampon: mobil ağda parçalar gecikirse ses kesilmesin
const REPLY_TIMEOUT_MS = 12000; // Sam seni duyduktan sonra bu sürede cevap vermezse bağlantı yenilenir
const LEVEL_STEP_MS = 50; // worklet'in seviye gönderme aralığı
const ECHO_TAIL_MS = 350; // sözünü kesme kapalıyken Sam susunca mikrofon bu kadar (+ çıkış gecikmesi) daha kapalı kalır

export const LIVE_VOICES = [
  ['Puck', 'Puck – erkek, neşeli'],
  ['Charon', 'Charon – erkek, bilgilendirici'],
  ['Orus', 'Orus – erkek, sakin ve net'],
  ['Fenrir', 'Fenrir – erkek, enerjik'],
  ['Kore', 'Kore – kadın, net'],
  ['Aoede', 'Aoede – kadın, rahat'],
  ['Leda', 'Leda – kadın, genç'],
  ['Zephyr', 'Zephyr – kadın, parlak'],
];

export class LiveError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'auth' | 'rate' | 'bad-request' | 'network' | 'mic'
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function parseMessage(data) {
  try {
    return JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
  } catch {
    return null;
  }
}

function closeError(code, reason = '') {
  if (/api key|permission|unauthori|forbidden|unauthenticated/i.test(reason)) {
    return new LiveError('auth', 'API anahtarı geçersiz ya da Canlı mod için yetkisiz.');
  }
  if (/quota|exhausted|rate limit|too many/i.test(reason)) return new LiveError('rate', 'Canlı modun ücretsiz kullanım sınırına takıldı.');
  if (/not found|not supported|unknown name|invalid/i.test(reason)) return new LiveError('bad-request', `Canlı mod isteği reddedildi: ${reason}`);
  return new LiveError('network', `Canlı bağlantı koptu${reason ? `: ${reason}` : ` (${code})`}.`);
}

export class LiveClient {
  // Ses bağlamı Başla'ya basıldığı an (kullanıcı hareketinin içinde) açılmalı; sonradan açılırsa
  // mobil Chrome onu askıda başlatabiliyor. Giriş ve çıkış aynı, cihazın kendi hızındaki bağlamı kullanır.
  static createAudio() {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    ctx.resume().catch(() => {});
    return ctx;
  }

  // config: { apiKey, model, voice, system, tools, silenceMs, bargeIn, voiceProcessing, micId, speakerId,
  //          captureMic, audio, socketFactory }
  // events: onLearnerText, onPartnerText, onSpeaking, onInterrupted, onTurnComplete, onToolCall,
  //         onReconnecting, onReconnected, onClosed, onMicProblem
  constructor(config, events = {}) {
    this.config = config;
    this.events = events;
    this.socketFactory = config.socketFactory || ((url) => new WebSocket(url));
    this.ctx = config.audio || LiveClient.createAudio();
    this.ws = null;
    this.ready = false;
    this.closed = false;
    this.handle = null;
    this.reconnects = 0;
    this.pendingSwap = false;
    this.micMuted = false;
    this.micLevel = 0;
    this.speaking = false;
    this.echoUntil = 0;
    this.turnActive = false;
    this.turnHasAudio = false;
    this.dropAudio = false;
    this.sources = new Set();
    this.playhead = 0;
    this.idleWaiters = [];
    this.turnWaiters = [];
    // Yerel konuşma algılama (sunucunun algılamasına yedek)
    this.noise = 0.005;
    this.voiceMs = 0;
    this.quietMs = 0;
    this.userTalking = false;
    this.heardText = false;
    this.replyDeadline = 0;
  }

  async start() {
    const ctx = this.ctx;
    // Android bağlamı ses odağı değişince (bildirim, Bluetooth) askıya alabiliyor: geri aç.
    ctx.onstatechange = () => {
      if (ctx.state === 'suspended' && !this.closed) ctx.resume().catch(() => {});
    };
    await ctx.resume().catch(() => {});
    if (this.config.speakerId && ctx.setSinkId) await ctx.setSinkId(this.config.speakerId).catch(() => {});
    this.output = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.levelBuffer = new Float32Array(this.analyser.fftSize);
    this.output.connect(this.analyser).connect(ctx.destination);
    if (this.config.captureMic) await this.startMic();
    await this.connect();
    this.watchdog = setInterval(() => this.checkWatchdog(), 1000);
  }

  async startMic() {
    const { micId = '', voiceProcessing = true } = this.config;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(micConstraints({ deviceId: micId, processing: voiceProcessing }))
        .catch((err) => {
          if (!micId || err.name !== 'OverconstrainedError') throw err;
          this.events.onMicProblem?.('Seçtiğin mikrofon açılamadı; telefonun seçtiği mikrofon kullanılıyor.');
          return navigator.mediaDevices.getUserMedia(micConstraints({ processing: voiceProcessing }));
        });
    } catch (err) {
      throw new LiveError('mic', err.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi.' : 'Mikrofona erişilemiyor.');
    }
    const [track] = this.stream.getAudioTracks();
    track?.addEventListener('ended', () => this.events.onMicProblem?.('Mikrofon bağlantısı kesildi.'));
    await this.ctx.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.ctx, 'pcm-capture', { processorOptions: { chunkSize: 1600 } });
    this.worklet.port.onmessage = ({ data }) => {
      if (data.type === 'pcm') this.sendAudio(data.buffer);
      else if (data.type === 'level') this.onMicLevel(data.rms);
    };
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    source.connect(this.worklet).connect(silent).connect(this.ctx.destination);
    await this.ctx.resume().catch(() => {});
    this.micStartedAt = Date.now();
    this.micPeak = 0;
  }

  onMicLevel(rms) {
    this.micLevel = this.micMuted ? 0 : rms;
    this.micPeak = Math.max(this.micPeak, rms);
    if (!this.micWarned && Date.now() - this.micStartedAt > 6000 && this.micPeak < 1e-4) {
      this.micWarned = true;
      this.events.onMicProblem?.('Mikrofondan ses gelmiyor. Başka bir uygulama mikrofonu kullanıyor olabilir.');
    }
    this.trackSpeech(rms);
  }

  // Gürültü tabanını izleyen basit konuşma algılama. Sen susunca sunucuya "ses bitti" denir;
  // sunucunun kendi algılaması gürültülü ortamda (araba) takılırsa bile sıra Sam'e geçer.
  trackSpeech(rms) {
    // Gürültü tabanı sessizlikte hızla iner, seste yavaşça yükselir; araç gürültüsü konuşmayı bastırmasın diye sınırlı.
    this.noise = rms < this.noise ? this.noise * 0.6 + rms * 0.4 : Math.min(0.06, this.noise * 0.995 + rms * 0.005);
    const voiced = rms > Math.max(this.noise * 2.5, 0.008) && !this.hearsEcho();
    if (voiced && !this.micMuted) {
      this.voiceMs += LEVEL_STEP_MS;
      this.quietMs = 0;
      if (this.voiceMs >= 250) this.userTalking = true;
      return;
    }
    this.quietMs += LEVEL_STEP_MS;
    if (!this.userTalking) {
      this.voiceMs = 0;
      return;
    }
    if (this.quietMs >= this.config.silenceMs + 500 && !this.speaking && !this.micMuted) {
      this.userTalking = false;
      this.voiceMs = 0;
      this.send({ realtimeInput: { audioStreamEnd: true } });
      if (this.heardText) this.replyDeadline = Date.now() + REPLY_TIMEOUT_MS;
    }
  }

  // Sam seni duydu (yazıya döktü) ama cevap gelmiyorsa bağlantıyı aynı oturumla yenile.
  checkWatchdog() {
    if (!this.replyDeadline || Date.now() < this.replyDeadline) return;
    this.replyDeadline = 0;
    if (this.turnActive || this.speaking || !this.ready || this.closed) return;
    this.restart(new LiveError('network', 'Sam cevap vermedi'), 'no-reply');
  }

  restart(error, reason) {
    const old = this.ws;
    this.ws = null;
    this.ready = false;
    try { old?.close(); } catch { /* zaten kapalı */ }
    this.reconnect(error, reason);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ready = false;
      const ws = this.socketFactory(`${WS_URL}?key=${encodeURIComponent(this.config.apiKey)}`);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.ws = null;
        try { ws.close(); } catch { /* zaten kapalı */ }
        reject(new LiveError('network', 'Canlı moda bağlanılamadı (zaman aşımı).'));
      }, SETUP_TIMEOUT_MS);

      ws.onopen = () => ws.send(JSON.stringify({ setup: this.buildSetup() }));
      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        const message = parseMessage(event.data);
        if (!message) return;
        if (message.setupComplete) {
          this.ready = true;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve();
          }
          return;
        }
        this.handleMessage(message);
      };
      ws.onclose = (event) => {
        if (this.ws !== ws) return; // bilerek değiştirilen eski bağlantı
        this.ws = null;
        this.ready = false;
        const error = closeError(event.code, event.reason);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        } else {
          this.reconnect(error);
        }
      };
    });
  }

  buildSetup() {
    const c = this.config;
    const setup = {
      model: `models/${c.model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } },
      },
      systemInstruction: { parts: [{ text: c.system }] },
      realtimeInputConfig: {
        automaticActivityDetection: { prefixPaddingMs: 300, silenceDurationMs: c.silenceMs },
        activityHandling: c.bargeIn ? 'START_OF_ACTIVITY_INTERRUPTS' : 'NO_INTERRUPTION',
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: this.handle ? { handle: this.handle } : {},
    };
    if (c.tools?.length) setup.tools = [{ functionDeclarations: c.tools }];
    return setup;
  }

  handleMessage(message) {
    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) this.handle = update.newHandle;
    if (message.goAway) {
      // Sunucu bağlantıyı birazdan kapatacak: konuşma bitince yeni bağlantıya geç.
      this.pendingSwap = true;
      if (!this.turnActive) this.swap();
    }
    if (message.toolCall?.functionCalls?.length) {
      this.replyDeadline = 0;
      this.heardText = false;
      this.events.onToolCall?.(message.toolCall.functionCalls);
    }

    const content = message.serverContent;
    if (!content) return;
    if (content.inputTranscription?.text) {
      this.heardText = true;
      this.events.onLearnerText?.(content.inputTranscription.text);
    }
    if (content.outputTranscription?.text) {
      this.markReply();
      if (!this.dropAudio) this.events.onPartnerText?.(content.outputTranscription.text);
    }
    for (const part of content.modelTurn?.parts || []) {
      if (!part.inlineData?.data || !/audio/i.test(part.inlineData.mimeType || 'audio/pcm')) continue;
      this.markReply();
      if (!this.dropAudio) this.play(part.inlineData.data);
    }
    if (content.interrupted) {
      this.stopPlayback();
      this.events.onInterrupted?.();
      this.endTurn();
    }
    if (content.turnComplete) {
      this.events.onTurnComplete?.();
      this.endTurn();
    }
  }

  markReply() {
    this.turnActive = true;
    this.replyDeadline = 0;
    this.heardText = false;
  }

  endTurn() {
    this.turnActive = false;
    this.turnHasAudio = false;
    this.dropAudio = false;
    const waiters = this.turnWaiters;
    this.turnWaiters = [];
    waiters.forEach((resolve) => resolve());
    this.updateSpeaking();
    if (this.pendingSwap) this.swap();
  }

  // Bağlantıyı aynı oturumla yeniler (goAway geldiğinde).
  async swap() {
    if (this.closed || !this.pendingSwap) return;
    this.pendingSwap = false;
    const old = this.ws;
    this.ws = null;
    try { old?.close(); } catch { /* zaten kapalı */ }
    try {
      await this.connect();
    } catch (err) {
      this.reconnect(err);
    }
  }

  async reconnect(error, reason = 'dropped') {
    this.stopPlayback();
    this.endTurn();
    if (this.closed) return;
    const fatal = ['auth', 'rate', 'bad-request'].includes(error.kind);
    if (fatal || this.reconnects >= MAX_RECONNECTS) {
      this.events.onClosed?.(error);
      return;
    }
    this.reconnects += 1;
    this.events.onReconnecting?.(this.reconnects, error);
    await sleep(reason === 'no-reply' ? 300 : Math.min(8000, 1000 * this.reconnects));
    if (this.closed) return;
    try {
      await this.connect();
      this.reconnects = 0;
      this.events.onReconnected?.(Boolean(this.handle), reason);
    } catch (err) {
      this.reconnect(err);
    }
  }

  send(message) {
    if (this.ws && this.ready && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  // Sözünü kesme kapalıyken Sam konuşurken (ve sesinin hoparlörden bitmesine kadar) mikrofon
  // yalnızca onun yankısını duyar; bu ses gönderilmez, konuşma sayılmaz.
  hearsEcho() {
    return !this.config.bargeIn && (this.speaking || performance.now() < this.echoUntil);
  }

  sendAudio(buffer) {
    if (this.micMuted || this.hearsEcho()) return;
    this.send({ realtimeInput: { audio: { data: toBase64(buffer), mimeType: `audio/pcm;rate=${INPUT_RATE}` } } });
  }

  sendText(text) {
    return this.send({ realtimeInput: { text } });
  }

  // Metni gönderir; Sam cevabını bitirip sesi çalınana kadar bekler.
  async request(text, timeout = 45000) {
    const answered = new Promise((resolve) => {
      this.turnWaiters.push(resolve);
      setTimeout(resolve, timeout);
    });
    if (!this.sendText(text)) return;
    await answered;
    await this.waitForIdle();
  }

  sendToolResponse(functionResponses) {
    this.send({ toolResponse: { functionResponses } });
  }

  setMicMuted(muted) {
    this.micMuted = muted;
    if (muted) {
      this.micLevel = 0;
      this.userTalking = false;
      this.voiceMs = 0;
    }
  }

  // Sam'in o anki cevabını sustur (dokunarak atlama, duraklatma).
  skipCurrent() {
    if (this.turnActive) this.dropAudio = true;
    this.stopPlayback();
  }

  // Bekleyen request() çağrılarını hemen bitir.
  cancelRequests() {
    const waiters = this.turnWaiters;
    this.turnWaiters = [];
    waiters.forEach((resolve) => resolve());
    this.checkIdle(true);
  }

  play(base64) {
    const data = fromBase64(base64);
    const pcm = new Int16Array(data, 0, Math.floor(data.byteLength / 2));
    if (!pcm.length) return;
    const buffer = this.ctx.createBuffer(1, pcm.length, OUTPUT_RATE); // bağlam kendi hızına çevirir
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    const now = this.ctx.currentTime;
    if (this.playhead < now) this.playhead = now + START_BUFFER_S;
    source.start(this.playhead);
    this.playhead += buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.updateSpeaking();
    };
    this.turnHasAudio = true;
    this.updateSpeaking();
  }

  stopPlayback() {
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* başlamamış */ }
    }
    this.sources.clear();
    this.playhead = 0;
    this.turnHasAudio = false;
    this.updateSpeaking();
  }

  // Sam, sesi çalarken ve cevabı sürerken "konuşuyor" sayılır; parçalar arasındaki kısa
  // boşluklarda (mobil ağ) durum "dinliyor"a dönüp ekran titremesin.
  updateSpeaking() {
    const speaking = this.sources.size > 0 || (this.turnActive && this.turnHasAudio);
    if (speaking !== this.speaking) {
      this.speaking = speaking;
      // Bluetooth hoparlör sesi birkaç yüz ms geriden çalar; o kuyruk da yankı sayılır.
      if (!speaking) this.echoUntil = performance.now() + ECHO_TAIL_MS + (this.ctx.outputLatency || 0) * 1000;
      this.events.onSpeaking?.(speaking);
    }
    this.checkIdle();
  }

  // Sam'in sesinin o anki seviyesi (ağız animasyonu için).
  outputLevel() {
    if (!this.analyser || !this.sources.size) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    let sum = 0;
    for (const v of this.levelBuffer) sum += v * v;
    return Math.sqrt(sum / this.levelBuffer.length);
  }

  waitForIdle() {
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
      this.checkIdle();
    });
  }

  checkIdle(force = false) {
    if (!force && (this.speaking || this.turnActive)) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  close() {
    this.closed = true;
    this.ready = false;
    clearInterval(this.watchdog);
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* zaten kapalı */ }
    this.stopPlayback();
    this.cancelRequests();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.ctx.onstatechange = null;
    this.ctx.close().catch(() => {});
  }
}
