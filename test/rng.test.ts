import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../src/index.js';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-1');
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('differs across seeds', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-2');
    expect(a.next()).not.toBe(b.next());
  });

  it('yields floats in [0, 1)', () => {
    const rng = new Rng('range');
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('fork() is independent and reproducible', () => {
    const a = new Rng('base').fork('terrain');
    const b = new Rng('base').fork('terrain');
    const c = new Rng('base').fork('climate');
    expect(a.next()).toBe(b.next());
    expect(a.next()).not.toBe(c.next());
  });

  it('hashes seeds to unsigned 32-bit values', () => {
    const h = hashSeed('anything');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});
