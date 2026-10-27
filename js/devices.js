// Mikrofon ve hoparlör seçimi (Canlı mod). Seçim cihaz kimliği ve adıyla saklanır; kimlik
// değişirse adından bulunur. Android Chrome girişleri "Speakerphone", "Headset earpiece",
// "Bluetooth headset" gibi adlarla listeler. Yankı engelleme açıkken Android sesi telefon
// görüşmesi gibi yönlendirir (Bluetooth'ta arabanın mikrofonu ve görüşme kalitesinde ses);
// kapalıyken ses müzik gibi çalar ve seçilen telefon mikrofonu kullanılır.

const VIRTUAL_IDS = new Set(['', 'default', 'communications']);

const INPUT_NAMES = [
  [/speakerphone/i, 'Telefonun mikrofonu'],
  [/earpiece/i, 'Telefonun mikrofonu (ahize)'],
  [/bluetooth/i, 'Bluetooth (araba / kulaklık)'],
  [/wired/i, 'Kablolu kulaklık'],
  [/usb/i, 'USB ses aygıtı'],
];

export const canListDevices = () => Boolean(navigator.mediaDevices?.enumerateDevices);
export const canPickSpeaker = () => typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

// Android'in İngilizce mikrofon adlarını Türkçeye çevirir.
export const micName = (label) => INPUT_NAMES.find(([pattern]) => pattern.test(label))?.[1] || label;

function displayName(kind, label, index) {
  if (kind === 'audioinput' && label) return micName(label);
  return label || `${kind === 'audioinput' ? 'Mikrofon' : 'Hoparlör'} ${index + 1}`;
}

// kind: 'audioinput' | 'audiooutput'. Tarayıcının sanal "varsayılan" girdileri listelenmez.
export async function listDevices(kind) {
  if (!canListDevices()) return [];
  const devices = (await navigator.mediaDevices.enumerateDevices())
    .filter((d) => d.kind === kind && !VIRTUAL_IDS.has(d.deviceId));
  return devices.map((d, i) => ({ id: d.deviceId, label: d.label, name: displayName(kind, d.label, i) }));
}

// Kayıtlı seçimi şu anki kimliğe çevirir: '' = telefonun varsayılanı, null = seçilen aygıt bağlı değil.
export async function resolveDevice(kind, id, label) {
  if (!id) return '';
  try {
    const devices = await listDevices(kind);
    const match = devices.find((d) => d.id === id) || (label && devices.find((d) => d.label === label));
    return match ? match.id : null;
  } catch {
    return null;
  }
}

export function micConstraints({ deviceId = '', processing = true } = {}) {
  const audio = { channelCount: 1, echoCancellation: processing, noiseSuppression: processing, autoGainControl: processing };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return { audio };
}

// Ayarlar'daki "Dene": seçili mikrofonu açıp seviyesini ölçer ve kısa bir zil çalar.
// Oturumdaki sırayla aynı: önce ses bağlamı, sonra mikrofon; zil, karakterin sesinin çıkacağı yerden duyulur.
export class AudioTest {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
  }

  get running() {
    return Boolean(this.ctx);
  }

  // Dokunuşun içinde çağrılmalı (ses bağlamı ilk satırda açılır). Açılan mikrofonun adını döndürür.
  // settings: { micId, micLabel, speakerId, speakerLabel, voiceProcessing }
  async start(settings) {
    this.stop();
    const ctx = new AudioContext();
    this.ctx = ctx;
    ctx.resume().catch(() => {});
    let stream;
    let speakerId = '';
    try {
      const micId = await resolveDevice('audioinput', settings.micId, settings.micLabel);
      if (canPickSpeaker()) speakerId = await resolveDevice('audiooutput', settings.speakerId, settings.speakerLabel);
      stream = await navigator.mediaDevices.getUserMedia(micConstraints({ deviceId: micId || '', processing: settings.voiceProcessing }));
    } catch (err) {
      this.stop();
      throw err;
    }
    if (this.ctx !== ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return '';
    }
    this.stream = stream;
    if (speakerId && ctx.setSinkId) await ctx.setSinkId(speakerId).catch(() => {});
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.buffer = new Float32Array(this.analyser.fftSize);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(this.analyser).connect(mute).connect(ctx.destination);
    this.chime();
    return stream.getAudioTracks()[0]?.label || '';
  }

  level() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (const v of this.buffer) sum += v * v;
    return Math.sqrt(sum / this.buffer.length);
  }

  chime() {
    const ctx = this.ctx;
    const start = ctx.currentTime + 0.3;
    [660, 880].forEach((frequency, i) => {
      const at = start + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.75);
    });
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.analyser = null;
    this.ctx = null;
  }
}
