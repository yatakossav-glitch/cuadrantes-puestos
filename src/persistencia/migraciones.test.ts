import { describe, expect, it } from 'vitest';
import type { Migracion } from '../modelo/esquema';
import { VERSION_ESQUEMA } from '../modelo/esquema';
import { migrar } from './migraciones';

const cadena: Migracion[] = [
  { desde: 1, migrar: (d) => ({ ...(d as object), v2: true }) },
  { desde: 2, migrar: (d) => ({ ...(d as object), v3: true }) },
];

describe('migrar', () => {
  it('sin migraciones y versión actual devuelve los datos tal cual', () => {
    const d = { a: 1 };
    expect(migrar(d, VERSION_ESQUEMA)).toEqual({ ok: true, datos: d });
  });

  it('encadena 1 → 2 → 3', () => {
    expect(migrar({ a: 1 }, 1, cadena, 3)).toEqual({ ok: true, datos: { a: 1, v2: true, v3: true } });
  });

  it('desde la 2 solo aplica la 2 → 3', () => {
    expect(migrar({ a: 1 }, 2, cadena, 3)).toEqual({ ok: true, datos: { a: 1, v3: true } });
  });

  it('rechaza una versión futura', () => {
    const r = migrar({}, VERSION_ESQUEMA + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('más moderna');
    expect(migrar({}, 4, cadena, 3).ok).toBe(false);
  });

  it('rechaza versiones menores que 1 o no enteras', () => {
    expect(migrar({}, 0).ok).toBe(false);
    expect(migrar({}, -3).ok).toBe(false);
    expect(migrar({}, 1.5).ok).toBe(false);
    expect(migrar({}, Number.NaN).ok).toBe(false);
  });

  it('avisa si falta un eslabón de la cadena', () => {
    const rota: Migracion[] = [cadena[0]!, { desde: 3, migrar: (d) => d }];
    const r = migrar({}, 1, rota, 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('2 a la 3');
  });

  it('captura migraciones que lanzan', () => {
    const r = migrar({}, 1, [{ desde: 1, migrar: () => { throw new Error('x'); } }], 2);
    expect(r.ok).toBe(false);
  });

  it('con la lista por defecto el destino es VERSION_ESQUEMA aunque no haya migraciones', () => {
    expect(migrar({ a: 1 }, VERSION_ESQUEMA).ok).toBe(true);
  });

  it('rechaza si la cadena no llega exactamente al destino', () => {
    const corta: Migracion[] = [cadena[0]!];
    expect(migrar({}, 1, corta, 3).ok).toBe(false);
    expect(migrar({}, 1, cadena, 2).ok).toBe(true);
  });
});
