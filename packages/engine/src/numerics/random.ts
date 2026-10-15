function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

function hashString(text: string): number {
  // FNV-1a, 32 bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * xoshiro128** (Blackman and Vigna 2018): small, fast, seedable PRNG so every Monte Carlo
 * run is reproducible from its seed.
 */
export class Xoshiro128ss {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number | string) {
    const base = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    const next = splitmix32(base);
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform double in [0, 1) with 53 random bits. */
  nextFloat(): number {
    const hi = this.nextUint32() >>> 5; // 27 bits
    const lo = this.nextUint32() >>> 6; // 26 bits
    return (hi * 67108864 + lo) / 9007199254740992;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Latin hypercube sample (McKay, Beckman and Conover 1979): n points in [0, 1)^dims with
 * exactly one point per stratum in each dimension.
 */
export function latinHypercube(n: number, dims: number, rng: Xoshiro128ss): number[][] {
  const rows: number[][] = Array.from({ length: n }, () => new Array<number>(dims).fill(0));
  for (let d = 0; d < dims; d++) {
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng.nextFloat() * (i + 1));
      const tmp = perm[i] as number;
      perm[i] = perm[j] as number;
      perm[j] = tmp;
    }
    for (let i = 0; i < n; i++) {
      (rows[i] as number[])[d] = ((perm[i] as number) + rng.nextFloat()) / n;
    }
  }
  return rows;
}
