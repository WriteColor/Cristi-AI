/** Stateful windowed-sinc resampler. Integer output position prevents block rounding drift. */
export class StreamingResampler {
  private samples: number[] = [];
  private base = 0;
  private received = 0;
  private produced = 0;
  private readonly radius = 24;
  constructor(readonly sourceRate: number, readonly targetRate = 16000) {
    if (sourceRate <= 0 || targetRate <= 0) throw new Error('Invalid sample rate');
  }
  reset(): void { this.samples = []; this.base = this.received = this.produced = 0; }
  process(input: Float32Array, final = false): Float32Array {
    if (this.sourceRate === this.targetRate) return input.slice();
    for (const sample of input) this.samples.push(sample);
    this.received += input.length;
    const result: number[] = [];
    const cutoff = Math.min(1, this.targetRate / this.sourceRate) * 0.94;
    while (this.produced * this.sourceRate / this.targetRate < this.received - (final ? 0 : this.radius)) {
      const position = this.produced * this.sourceRate / this.targetRate;
      const center = Math.floor(position);
      let sum = 0; let weight = 0;
      for (let i = center - this.radius + 1; i <= center + this.radius; i++) {
        const distance = position - i;
        const x = Math.PI * distance * cutoff;
        const sinc = Math.abs(x) < 1e-10 ? 1 : Math.sin(x) / x;
        const window = 0.5 + 0.5 * Math.cos(Math.PI * distance / this.radius);
        const coefficient = sinc * window * cutoff;
        const sample = i < 0 || i >= this.received ? 0 : (this.samples[i - this.base] ?? 0);
        sum += sample * coefficient; weight += coefficient;
      }
      result.push(sum / weight);
      this.produced++;
    }
    const discard = Math.max(0, Math.floor(this.produced * this.sourceRate / this.targetRate) - this.radius - this.base);
    this.samples.splice(0, discard); this.base += discard;
    return Float32Array.from(result);
  }
}
