/**
 * Every noise the simulation emits is heard: a short burst of filtered noise, louder the
 * further it carries and the closer it is to the player. Synthesised with Web Audio, so
 * there are no sound assets. The context starts on the first key press, as browsers require.
 */
export class NoiseSounds {
  private context: AudioContext | null = null;

  /** Call from a user gesture; later calls are free. */
  start(): void {
    if (this.context) {
      if (this.context.state === 'suspended') {
        void this.context.resume();
      }
      return;
    }
    if (typeof AudioContext === 'undefined') {
      return;
    }
    this.context = new AudioContext();
  }

  /** Plays a noise made at `distance` px from the listener that carries `radius` px. */
  play(radius: number, distance: number): void {
    const context = this.context;
    if (!context || context.state !== 'running' || radius <= 0) {
      return;
    }
    // Loudness: how far it carries, faded by how far away it is, but never lost within earshot.
    const loudness = Math.min(1, radius / 160);
    const falloff = Math.max(0, 1 - distance / (radius + 240));
    const gain = 0.5 * loudness * falloff;
    if (gain <= 0.005) {
      return;
    }
    const seconds = 0.045 + 0.1 * loudness;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      // Exponential decay: a thud, not a hiss.
      samples[i] = (Math.random() * 2 - 1) * Math.exp((-6 * i) / samples.length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300 + 900 * loudness;
    const volume = context.createGain();
    volume.gain.value = gain;
    source.connect(filter).connect(volume).connect(context.destination);
    source.start();
  }
}
