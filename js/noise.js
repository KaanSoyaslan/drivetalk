// Araç içindeki sabit gürültüye (lastik uğultusu, yol, klima) karşı konuşma algılama ve gürültü kapısı.
// Gürültü tabanı, son birkaç saniyedeki en düşük seviyedir: sabit uğultu hep oradadır, konuşma
// ise kelime aralarında düşer. Konuşma, sesin konuşma bandındaki (300–3400 Hz) gücünün bu tabanı
// belirgin şekilde aşmasıdır; lastik uğultusunun çoğu bu bandın altında kalır.
// Kapı açıkken (uğultu algılandı ya da "her zaman" seçili) sadece konuşurken ses gönderilir,
// arada sessizlik gider: Gemini uğultuyu konuşma sanıp seni sonsuza kadar dinlemez.
const STEP_MS = 50; // worklet seviye aralığı
const FLOOR_WINDOW = 80; // 4 sn
const VOICE_RATIO = 2.2; // konuşma, tabanın ~7 dB üstü
const MIN_VOICE = 0.004; // çok sessiz ortamda bile en az bu kadar
const OPEN_MS = 100; // bu kadar süren ses kapıyı açar (tek tük patlamalar açmaz)
const HOLD_MS = 450; // kelime aralarında kapı kapanmasın
const NOISY_ON = 0.008; // ~-42 dBFS sabit gürültü: "uğultu var"
const NOISY_OFF = 0.004;
const NOISY_ON_MS = 2000;
const NOISY_OFF_MS = 6000;

function windowMin(values) {
  let min = Infinity;
  for (const v of values) if (v < min) min = v;
  return min;
}

export class NoiseGuard {
  // mode: 'auto' | 'on' | 'off'. onChange({ noisy, active }) durum değişince çağrılır.
  constructor({ mode = 'auto', onChange = () => {} } = {}) {
    this.mode = mode;
    this.onChange = onChange;
    this.speechHistory = [];
    this.fullHistory = [];
    this.speechFloor = 0;
    this.fullFloor = 0;
    this.voiceMs = 0;
    this.quietMs = 0;
    this.open = false;
    this.voiced = false;
    this.noisy = false;
    this.noisyMs = 0;
  }

  // Kapı devrede mi: uğultu algılandıysa (otomatik) ya da hep açık seçildiyse.
  get active() {
    return this.mode === 'on' || (this.mode === 'auto' && this.noisy);
  }

  // Her 50 ms'de: full = tüm bandın, speech = konuşma bandının seviyesi (RMS).
  update(full, speech) {
    this.speechFloor = this.track(this.speechHistory, speech, this.speechFloor);
    this.fullFloor = this.track(this.fullHistory, full, this.fullFloor);
    this.voiced = speech > Math.max(this.speechFloor * VOICE_RATIO, MIN_VOICE);

    if (this.voiced) {
      this.voiceMs += STEP_MS;
      this.quietMs = 0;
      if (this.voiceMs >= OPEN_MS) this.open = true;
    } else {
      this.quietMs += STEP_MS;
      this.voiceMs = 0;
      if (this.quietMs >= HOLD_MS) this.open = false;
    }
    this.trackNoisy();
  }

  track(history, value, floor) {
    history.push(value);
    if (history.length > FLOOR_WINDOW) history.shift();
    const min = windowMin(history);
    return floor ? floor * 0.8 + min * 0.2 : min;
  }

  trackNoisy() {
    const wasActive = this.active;
    const wasNoisy = this.noisy;
    const loud = this.noisy ? this.fullFloor > NOISY_OFF : this.fullFloor > NOISY_ON;
    if (loud === this.noisy) this.noisyMs = 0;
    else if ((this.noisyMs += STEP_MS) >= (this.noisy ? NOISY_OFF_MS : NOISY_ON_MS)) {
      this.noisy = loud;
      this.noisyMs = 0;
    }
    if (this.noisy !== wasNoisy || this.active !== wasActive) this.onChange({ noisy: this.noisy, active: this.active });
  }
}
