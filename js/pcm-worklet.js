// Mikrofon sesini Gemini Live'ın istediği biçime çevirir: 16 kHz, 16 bit, mono PCM.
// Ses bağlamı cihazın kendi hızında (çoğunlukla 48 kHz) çalışır; bazı Android telefonlar
// zorla 16 kHz açılan bağlamda mikrofonu sessiz veriyor. Ses önce alçak geçiren filtreden
// geçirilip 16 kHz'e indirilir. Ayrıca ses seviyesi göstergesi için 50 ms'de bir seviye yollar.
const TARGET_RATE = 16000;

function lowpass(fs, f0, q = Math.SQRT1_2) {
  const w0 = (2 * Math.PI * f0) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cos) / 2 / a0, b1: (1 - cos) / a0, b2: (1 - cos) / 2 / a0,
    a1: (-2 * cos) / a0, a2: (1 - alpha) / a0,
    x1: 0, x2: 0, y1: 0, y2: 0,
  };
}

function filter(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1;
  f.x1 = x;
  f.y2 = f.y1;
  f.y1 = y;
  return y;
}

class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options.processorOptions?.chunkSize || 1600; // 100 ms
    this.chunk = new Int16Array(this.size);
    this.length = 0;
    this.ratio = sampleRate / TARGET_RATE;
    this.filters = this.ratio > 1 ? [lowpass(sampleRate, 7000), lowpass(sampleRate, 7000)] : [];
    this.prev = 0;
    this.pos = 0;
    this.levelSum = 0;
    this.levelCount = 0;
    this.levelEvery = Math.round(sampleRate / 20);
  }

  push(sample) {
    const s = Math.max(-1, Math.min(1, sample));
    this.chunk[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.length === this.size) {
      this.port.postMessage({ type: 'pcm', buffer: this.chunk.buffer }, [this.chunk.buffer]);
      this.chunk = new Int16Array(this.size);
      this.length = 0;
    }
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const raw = input[i];
      this.levelSum += raw * raw;
      if (++this.levelCount >= this.levelEvery) {
        this.port.postMessage({ type: 'level', rms: Math.sqrt(this.levelSum / this.levelCount) });
        this.levelSum = 0;
        this.levelCount = 0;
      }
      let x = raw;
      for (const f of this.filters) x = filter(f, x);
      // Doğrusal ara değerleme: önceki örnek (0) ile bu örnek (1) arasına düşen çıkış örnekleri.
      while (this.pos <= 1) {
        this.push(this.prev + (x - this.prev) * this.pos);
        this.pos += this.ratio;
      }
      this.pos -= 1;
      this.prev = x;
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
