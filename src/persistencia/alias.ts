import type { EstadoApp } from '../modelo/tipos';

/**
 * Los alias solo viven en este navegador: una copia importada sin alias no debe borrar los actuales.
 * A cada persona importada con alias null le pone el de la persona actual con el mismo id
 * o, si no, con el mismo código. No muta las entradas.
 */
export function conservarAlias(actual: EstadoApp, importado: EstadoApp): EstadoApp {
  const porId = new Map<string, string>();
  const porCodigo = new Map<string, string>();
  for (const p of actual.personas) {
    if (p.alias === null) continue;
    porId.set(p.id, p.alias);
    porCodigo.set(p.codigo, p.alias);
  }
  return {
    ...importado,
    personas: importado.personas.map((p) => {
      if (p.alias !== null) return p;
      const alias = porId.get(p.id) ?? porCodigo.get(p.codigo) ?? null;
      return alias === null ? p : { ...p, alias };
    }),
  };
}
