import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import { conservarAlias } from './alias';

describe('conservarAlias', () => {
  it('recupera el alias por id y por código sin mutar las entradas', () => {
    const actual = crearEstadoEjemplo();
    actual.personas[0]!.alias = 'Ana';
    actual.personas[1]!.alias = 'Beto';
    const importado = crearEstadoEjemplo();
    importado.personas[1]!.id = 'otro-id'; // mismo código, distinto id
    importado.personas[2]!.alias = 'Propio';
    actual.personas[2]!.alias = 'Pisado';
    const copiaImportado = JSON.stringify(importado);
    const copiaActual = JSON.stringify(actual);

    const r = conservarAlias(actual, importado);
    expect(r.personas[0]!.alias).toBe('Ana');
    expect(r.personas[1]!.alias).toBe('Beto');
    expect(r.personas[2]!.alias).toBe('Propio');
    expect(r.personas[3]!.alias).toBeNull();
    expect(JSON.stringify(importado)).toBe(copiaImportado);
    expect(JSON.stringify(actual)).toBe(copiaActual);
  });
});
