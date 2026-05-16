// Captures mono Float32 audio at the AudioContext's sample rate (24kHz),
// buffers into 1920-sample frames (80ms), converts to Int16 little-endian PCM,
// and posts each frame's ArrayBuffer to the main thread.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 1920;
    this.buffer = new Float32Array(this.frameSize);
    this.writeIdx = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const ch = input[0];
    for (let i = 0; i < ch.length; i++) {
      this.buffer[this.writeIdx++] = ch[i];
      if (this.writeIdx === this.frameSize) {
        const out = new Int16Array(this.frameSize);
        for (let j = 0; j < this.frameSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          out[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(out.buffer, [out.buffer]);
        this.writeIdx = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PcmWorklet);
