// Mikrofon sesini Gemini Live'ın istediği biçime çevirir: 16 kHz, 16 bit, mono PCM.
// AudioContext 16 kHz açılamadıysa basit ortalamayla örnek seyreltir.
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options.processorOptions?.chunkSize || 1600; // 100 ms
    this.chunk = new Int16Array(this.size);
    this.length = 0;
    this.ratio = sampleRate / 16000;
    this.position = 0;
    this.sum = 0;
    this.count = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count += 1;
      this.position += 1;
      if (this.position < this.ratio) continue;
      this.position -= this.ratio;
      const s = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.chunk[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.length === this.size) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(this.size);
        this.length = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
