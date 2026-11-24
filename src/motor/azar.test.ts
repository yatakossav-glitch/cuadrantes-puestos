import { describe, expect, it } from 'vitest';
import { enteroHasta, mulberry32 } from './azar';

describe('mulberry32', () => {
  it('es determinista para la misma semilla', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const sa = Array.from({ length: 20 }, () => a());
    const sb = Array.from({ length: 20 }, () => b());
    expect(sa).toEqual(sb);
  });

  it('semillas distintas dan secuencias distintas', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('produce valores en [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('enteroHasta respeta el rango', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 200; i += 1) expect([0, 1, 2]).toContain(enteroHasta(r, 3));
    expect(enteroHasta(r, 1)).toBe(0);
    expect(enteroHasta(r, 0)).toBe(0);
  });
});
