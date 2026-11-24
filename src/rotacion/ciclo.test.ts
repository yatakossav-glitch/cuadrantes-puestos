import { describe, expect, it } from 'vitest';
import { semanaDelCiclo } from './ciclo';

const rot = { longitudCiclo: 2, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B'] };

describe('semanaDelCiclo', () => {
  it('alterna A y B hacia delante y hacia atrás', () => {
    expect(semanaDelCiclo(rot, '2026-11-23').etiqueta).toBe('A');
    expect(semanaDelCiclo(rot, '2026-11-30').etiqueta).toBe('B');
    expect(semanaDelCiclo(rot, '2026-11-16').etiqueta).toBe('B');
    expect(semanaDelCiclo(rot, '2026-11-29').etiqueta).toBe('A');
  });
  it('referencia que no cae en lunes: cuenta su semana', () => {
    expect(semanaDelCiclo({ ...rot, lunesReferencia: '2026-11-26' }, '2026-11-23').indice).toBe(0);
    expect(semanaDelCiclo({ ...rot, lunesReferencia: '2026-11-26' }, '2026-12-01').indice).toBe(1);
  });
  it('ciclo de 1 o inválido', () => {
    expect(semanaDelCiclo({ ...rot, longitudCiclo: 0 }, '2026-12-07').indice).toBe(0);
  });
});
