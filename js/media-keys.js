// Direksiyondaki ya da Bluetooth kulaklıktaki medya tuşları: oynat/duraklat, ileri, geri.
// Tuşların Chrome'a gelmesi için sayfanın medya çalıyor olması gerekir; bunun için oturum
// boyunca döngüde sessiz bir ses dosyası çalınır. Araç ekranında "DriveTalk" yazar.
const DEBOUNCE_MS = 400;

function silentWav(seconds = 2, rate = 8000) {
  const samples = seconds * rate;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const ascii = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8 bit
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128); // 8 bit PCM'de sessizlik
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

const ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack'];

export class MediaKeys {
  constructor() {
    this.audio = null;
    this.active = false;
    this.lastPress = 0;
  }

  get supported() {
    return 'mediaSession' in navigator;
  }

  // handlers: { playPause, next, previous }. Başla'ya basılınca (kullanıcı hareketiyle) çağrılmalı.
  start(handlers) {
    if (!this.supported) return;
    this.active = true;
    if (!this.audio) {
      this.audio = new Audio(silentWav());
      this.audio.loop = true;
    }
    this.audio.play().catch((err) => console.warn('Medya tuşları için ses başlatılamadı:', err));
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'DriveTalk',
      artist: 'English practice with Sam',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    const press = (fn) => () => {
      const now = Date.now();
      if (now - this.lastPress < DEBOUNCE_MS) return; // bazı araçlar tek basışta iki olay yollar
      this.lastPress = now;
      fn();
    };
    const map = { play: handlers.playPause, pause: handlers.playPause, nexttrack: handlers.next, previoustrack: handlers.previous };
    for (const action of ACTIONS) {
      try { navigator.mediaSession.setActionHandler(action, press(map[action])); } catch { /* desteklenmeyen eylem */ }
    }
    this.setPaused(false);
  }

  setPaused(paused) {
    if (this.active) navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.audio?.pause();
    for (const action of ACTIONS) {
      try { navigator.mediaSession.setActionHandler(action, null); } catch { /* desteklenmeyen eylem */ }
    }
    navigator.mediaSession.playbackState = 'none';
  }
}
