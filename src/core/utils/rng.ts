/**
 * Deterministic pseudo-random number generator.
 *
 * The mock banking layer must produce *identical* data for a given seed. A demo
 * that reshuffles itself on every reload is impossible to reason about, and
 * detection-engine regression tests need a fixed corpus. `Math.random()` gives
 * us neither, so we carry our own generator.
 *
 * xmur3 (string -> 32-bit seed) + mulberry32 (fast, well-distributed, tiny).
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export interface WeightedOption<T> {
  value: T;
  weight: number;
}

export class SeededRandom {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'number' ? seed >>> 0 : xmur3(seed)();
    // Discard the first few draws: mulberry32's early output correlates with
    // low-entropy seeds such as "1", "2", "3".
    for (let i = 0; i < 8; i++) this.next();
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max] — both inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** True with probability `p`. */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('SeededRandom.pick: empty collection');
    return items[this.int(0, items.length - 1)]!;
  }

  /** Weighted pick — weights need not sum to 1. */
  weighted<T>(options: readonly WeightedOption<T>[]): T {
    const total = options.reduce((acc, o) => acc + o.weight, 0);
    let roll = this.next() * total;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) return option.value;
    }
    return options[options.length - 1]!.value;
  }

  /**
   * Box–Muller normal draw. Used for jittering charge dates and amounts so the
   * generated corpus looks like a real statement rather than a metronome.
   */
  gaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(this.next(), Number.EPSILON);
    const u2 = this.next();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Fisher–Yates, returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /** Picks `count` distinct items (or all of them, if the pool is smaller). */
  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, Math.min(count, items.length));
  }
}
