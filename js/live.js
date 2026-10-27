// Gemini Live API istemcisi (gerçek zamanlı sesli sohbet). Mikrofon sesi WebSocket üzerinden
// akar, Sam'in sesi geldikçe çalınır. Bağlantı ~10 dakikada bir yenilenir; oturum
// "session resumption" ile kaldığı yerden sürer, uzun sohbetler için bağlam sıkıştırılır.
const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const SETUP_TIMEOUT_MS = 15000;
const MAX_RECONNECTS = 5;

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
  // config: { apiKey, model, voice, system, tools, silenceMs, bargeIn, captureMic, socketFactory }
  // events: onLearnerText, onPartnerText, onSpeaking, onInterrupted, onTurnComplete, onToolCall,
  //         onReconnecting, onReconnected, onClosed
  constructor(config, events = {}) {
    this.config = config;
    this.events = events;
    this.socketFactory = config.socketFactory || ((url) => new WebSocket(url));
    this.ws = null;
    this.ready = false;
    this.closed = false;
    this.handle = null;
    this.reconnects = 0;
    this.pendingSwap = false;
    this.micMuted = false;
    this.speaking = false;
    this.turnActive = false;
    this.dropAudio = false;
    this.sources = new Set();
    this.playhead = 0;
    this.idleWaiters = [];
    this.turnWaiters = [];
  }

  async start() {
    this.output = new AudioContext({ sampleRate: OUTPUT_RATE });
    this.output.resume().catch(() => {});
    if (this.config.captureMic) await this.startMic();
    await this.connect();
  }

  async startMic() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      throw new LiveError('mic', err.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi.' : 'Mikrofona erişilemiyor.');
    }
    let source;
    try {
      this.input = new AudioContext({ sampleRate: INPUT_RATE });
      source = this.input.createMediaStreamSource(this.stream);
    } catch {
      // Bazı tarayıcılar mikrofonu farklı örnekleme hızlı bir bağlama bağlayamıyor; worklet seyreltir.
      this.input?.close().catch(() => {});
      this.input = new AudioContext();
      source = this.input.createMediaStreamSource(this.stream);
    }
    await this.input.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
    this.worklet = new AudioWorkletNode(this.input, 'pcm-capture', { processorOptions: { chunkSize: 1600 } });
    this.worklet.port.onmessage = (event) => this.sendAudio(event.data);
    const silent = this.input.createGain();
    silent.gain.value = 0;
    source.connect(this.worklet).connect(silent).connect(this.input.destination);
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
        automaticActivityDetection: {
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          prefixPaddingMs: 300,
          silenceDurationMs: c.silenceMs,
        },
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
    if (message.toolCall?.functionCalls?.length) this.events.onToolCall?.(message.toolCall.functionCalls);

    const content = message.serverContent;
    if (!content) return;
    if (content.inputTranscription?.text) this.events.onLearnerText?.(content.inputTranscription.text);
    if (content.outputTranscription?.text) {
      this.turnActive = true;
      if (!this.dropAudio) this.events.onPartnerText?.(content.outputTranscription.text);
    }
    for (const part of content.modelTurn?.parts || []) {
      if (!part.inlineData?.data || !/audio/i.test(part.inlineData.mimeType || 'audio/pcm')) continue;
      this.turnActive = true;
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

  endTurn() {
    this.turnActive = false;
    this.dropAudio = false;
    const waiters = this.turnWaiters;
    this.turnWaiters = [];
    waiters.forEach((resolve) => resolve());
    this.checkIdle();
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

  async reconnect(error) {
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
    await sleep(Math.min(8000, 1000 * this.reconnects));
    if (this.closed) return;
    try {
      await this.connect();
      this.reconnects = 0;
      this.events.onReconnected?.(Boolean(this.handle));
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

  sendAudio(buffer) {
    if (this.micMuted) return;
    if (!this.config.bargeIn && this.speaking) return; // hoparlör yankısı Sam'i durdurmasın
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
    const buffer = this.output.createBuffer(1, pcm.length, OUTPUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const source = this.output.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output.destination);
    const now = this.output.currentTime;
    if (this.playhead < now + 0.05) this.playhead = now + 0.05; // parçalar arasında takılmasın diye küçük tampon
    source.start(this.playhead);
    this.playhead += buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (!this.sources.size) this.setSpeaking(false);
    };
    this.setSpeaking(true);
  }

  stopPlayback() {
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* başlamamış */ }
    }
    this.sources.clear();
    this.playhead = 0;
    this.setSpeaking(false);
  }

  setSpeaking(speaking) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    this.events.onSpeaking?.(speaking);
    this.checkIdle();
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
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* zaten kapalı */ }
    this.stopPlayback();
    this.cancelRequests();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.input?.close().catch(() => {});
    this.output?.close().catch(() => {});
  }
}
