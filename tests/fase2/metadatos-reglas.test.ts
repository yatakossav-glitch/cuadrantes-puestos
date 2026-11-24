/** Caja negra: metadatos de los tipos de regla y restricción. ARQUITECTURA.md §9.1. */
import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../src/datos-ejemplo/ejemplo';
import {
  crearReglaGeneral, describirRegla, erroresRegla, METADATOS_GENERAL, TIPOS_GENERAL_ORDENADOS,
} from '../../src/reglas/metadatos-general';
import {
  crearRestriccion, describirRestriccion, erroresRestriccion, METADATOS_RESTRICCION, TIPOS_RESTRICCION_ORDENADOS,
} from '../../src/reglas/metadatos-persona';
import type { ReglaGeneral, RestriccionPersona, TipoReglaGeneral, TipoRestriccion } from '../../src/modelo/tipos';
import { IDS_EJEMPLO } from './ayudas';

const TIPOS_GENERAL: TipoReglaGeneral[] = [
  'sinSolapes', 'coberturaCompleta', 'personaDisponible', 'habilitacionRequerida', 'maxMinutosDia',
  'descansoEntreJornadas', 'noRepetirConsecutivas', 'mismaPersonaBloque', 'rotarEntreBloques',
  'exclusividadDiaria', 'respetarEquipo', 'maxDiasSemana', 'maxFranjasSiSoloArea', 'comidasEscalonadas',
  'repartoEquitativo',
];
const TIPOS_RESTRICCION: TipoRestriccion[] = [
  'diasDisponibles', 'diasNoDisponibles', 'noAntesDe', 'noDespuesDe', 'maxMinutosDia', 'minutosSemana',
  'maxDiasSemana', 'soloFinesDeSemana', 'noAsignarA', 'pausaMinima',
];
const ejemplo = crearEstadoEjemplo();
const PROHIBIDOS = [/area-/, /puesto-/, /per-/, /undefined/, /NaN/, /\[object/];

function sinTecnicismos(texto: string) {
  expect(texto.trim().length).toBeGreaterThan(0);
  for (const re of PROHIBIDOS) expect(texto).not.toMatch(re);
}

describe('catálogo general', () => {
  it('los 15 tipos están en el registro y en el orden del selector', () => {
    expect([...TIPOS_GENERAL_ORDENADOS].sort()).toEqual([...TIPOS_GENERAL].sort());
    expect(Object.keys(METADATOS_GENERAL).sort()).toEqual([...TIPOS_GENERAL].sort());
  });
  it.each(TIPOS_GENERAL)('%s: crearReglaGeneral da una regla válida y legible', (tipo) => {
    const r = crearReglaGeneral(tipo, ejemplo, 'regla-fijo');
    expect(r.id).toBe('regla-fijo');
    expect(r.tipo).toBe(tipo);
    expect(r.activa).toBe(true);
    expect(r.estado).toBe('validada');
    expect(r.nombre.length).toBeGreaterThan(0);
    expect(r.nota).toBe('');
    expect(r.dura).toBe(tipo !== 'repartoEquitativo');
    expect(r.peso).toBe(tipo === 'repartoEquitativo' ? 1 : 5);
    expect(erroresRegla(r, ejemplo)).toEqual([]);
    sinTecnicismos(describirRegla(r, ejemplo));
  });
  it('sin id explícito genera ids distintos con prefijo regla-', () => {
    const a = crearReglaGeneral('sinSolapes', ejemplo);
    const b = crearReglaGeneral('sinSolapes', ejemplo);
    expect(a.id).toMatch(/^regla-/);
    expect(a.id).not.toBe(b.id);
  });
  it('crear no muta los datos', () => {
    const e = crearEstadoEjemplo();
    const antes = JSON.stringify(e);
    for (const t of TIPOS_GENERAL) crearReglaGeneral(t, e);
    expect(JSON.stringify(e)).toBe(antes);
  });
  it('crear sobre un estado sin áreas ni puestos tampoco lanza ni da NaN', () => {
    const vacio = { ...crearEstadoEjemplo(), areas: [], puestos: [], personas: [], reglas: [] };
    for (const t of TIPOS_GENERAL) {
      const r = crearReglaGeneral(t, vacio);
      sinTecnicismos(describirRegla(r, vacio));
    }
  });
});

describe('reglas del ejemplo', () => {
  it('las 15 reglas no tienen errores y se describen sin ids internos', () => {
    expect(ejemplo.reglas).toHaveLength(15);
    for (const r of ejemplo.reglas) {
      expect(erroresRegla(r, ejemplo), r.id).toEqual([]);
      sinTecnicismos(describirRegla(r, ejemplo));
    }
  });
  it('maxMinutosDia: «4h30» y «Pedidos Web»', () => {
    const r = ejemplo.reglas.find((x) => x.tipo === 'maxMinutosDia')!;
    const t = describirRegla(r, ejemplo);
    expect(t).toContain('4h30');
    expect(t).toContain('Pedidos Web');
  });
  it('noRepetirConsecutivas nombra el área de ámbito', () => {
    const r = ejemplo.reglas.find((x) => x.tipo === 'noRepetirConsecutivas')!;
    expect(describirRegla(r, ejemplo)).toContain('Exposición LEGO');
  });
  it('comidasEscalonadas menciona domingo, 1h, 8h y las franjas', () => {
    const r = ejemplo.reglas.find((x) => x.tipo === 'comidasEscalonadas')!;
    const t = describirRegla(r, ejemplo);
    expect(t).toMatch(/domingo/i);
    for (const s of ['1h', '8h', '14:00', '15:00', '16:00', '17:00']) expect(t).toContain(s);
  });
  it('las 3 restricciones no tienen errores y se describen limpias', () => {
    const rs = ejemplo.personas.flatMap((p) => p.restricciones);
    expect(rs).toHaveLength(3);
    for (const r of rs) {
      expect(erroresRestriccion(r, ejemplo), r.id).toEqual([]);
      sinTecnicismos(describirRestriccion(r, ejemplo));
    }
  });
  it('descripciones de las restricciones de ejemplo', () => {
    const por = (id: string) => ejemplo.personas.flatMap((p) => p.restricciones).find((r) => r.id === id)!;
    expect(describirRestriccion(por('restr-no-viernes'), ejemplo)).toMatch(/viernes/i);
    expect(describirRestriccion(por('restr-no-despues-20'), ejemplo)).toContain('20:00');
    expect(describirRestriccion(por('restr-solo-finde'), ejemplo)).toMatch(/s[áa]bado y domingo/i);
  });
});

describe('dureza y peso de las reglas generales', () => {
  const base = () => crearReglaGeneral('rotarEntreBloques', ejemplo, 'r');
  it('peso 0 en una regla blanda da error', () => {
    expect(erroresRegla({ ...base(), dura: false, peso: 0 }, ejemplo).length).toBeGreaterThan(0);
  });
  it('peso negativo o con decimales en una blanda da error', () => {
    expect(erroresRegla({ ...base(), dura: false, peso: -1 }, ejemplo).length).toBeGreaterThan(0);
    expect(erroresRegla({ ...base(), dura: false, peso: 2.5 }, ejemplo).length).toBeGreaterThan(0);
  });
  it('peso 1 en una blanda y peso 0 en una dura no dan error', () => {
    expect(erroresRegla({ ...base(), dura: false, peso: 1 }, ejemplo)).toEqual([]);
    expect(erroresRegla({ ...base(), dura: true, peso: 0 }, ejemplo)).toEqual([]);
  });
  it('repartoEquitativo no admite ser dura', () => {
    const r = crearReglaGeneral('repartoEquitativo', ejemplo, 'r');
    expect(erroresRegla({ ...r, dura: true }, ejemplo).length).toBeGreaterThan(0);
    expect(erroresRegla({ ...r, dura: false, peso: 3 }, ejemplo)).toEqual([]);
  });
  it('el resto de tipos admite dura y blanda', () => {
    for (const t of TIPOS_GENERAL.filter((x) => x !== 'repartoEquitativo')) {
      const r = crearReglaGeneral(t, ejemplo, 'r');
      expect(erroresRegla({ ...r, dura: true } as ReglaGeneral, ejemplo), t).toEqual([]);
      expect(erroresRegla({ ...r, dura: false, peso: 5 } as ReglaGeneral, ejemplo), t).toEqual([]);
    }
  });
});

describe('parámetros inválidos de reglas generales', () => {
  const { lego, caja } = IDS_EJEMPLO.areas;
  const comun = { id: 'r', activa: true, estado: 'validada' as const, nombre: 'x', nota: '', dura: true, peso: 0 };
  const casos: [string, ReglaGeneral][] = [
    ['maxMinutosDia 0', { ...comun, tipo: 'maxMinutosDia', params: { maxMin: 0, excepciones: [] } }],
    ['maxMinutosDia más de 24h', { ...comun, tipo: 'maxMinutosDia', params: { maxMin: 1441, excepciones: [] } }],
    ['maxMinutosDia excepción repetida', { ...comun, tipo: 'maxMinutosDia', params: { maxMin: 270, excepciones: [{ areaId: caja, maxMin: null }, { areaId: caja, maxMin: 60 }] } }],
    ['maxMinutosDia excepción a área inexistente', { ...comun, tipo: 'maxMinutosDia', params: { maxMin: 270, excepciones: [{ areaId: 'area-fantasma', maxMin: null }] } }],
    ['descanso 0', { ...comun, tipo: 'descansoEntreJornadas', params: { minMin: 0 } }],
    ['maxDiasSemana 0', { ...comun, tipo: 'maxDiasSemana', params: { max: 0 } }],
    ['maxDiasSemana 8', { ...comun, tipo: 'maxDiasSemana', params: { max: 8 } }],
    ['exclusividad sin puestos', { ...comun, tipo: 'exclusividadDiaria', params: { puestoIds: [], diasExcepcion: [] } }],
    ['exclusividad con puesto inexistente', { ...comun, tipo: 'exclusividadDiaria', params: { puestoIds: ['puesto-fantasma'], diasExcepcion: [] } }],
    ['respetarEquipo 8 días', { ...comun, tipo: 'respetarEquipo', params: { maxDiasContrarioSemana: 8, diasPermitidos: [] } }],
    ['respetarEquipo negativo', { ...comun, tipo: 'respetarEquipo', params: { maxDiasContrarioSemana: -1, diasPermitidos: [] } }],
    ['maxFranjas área inexistente', { ...comun, tipo: 'maxFranjasSiSoloArea', params: { areaId: 'area-fantasma', maxFranjas: 1 } }],
    ['maxFranjas 0', { ...comun, tipo: 'maxFranjasSiSoloArea', params: { areaId: lego, maxFranjas: 0 } }],
    ['ámbito con área inexistente', { ...comun, tipo: 'noRepetirConsecutivas', params: { ambito: { areaIds: ['area-fantasma'], puestoIds: [] } } }],
    ['ámbito con puesto inexistente', { ...comun, tipo: 'mismaPersonaBloque', params: { ambito: { areaIds: [], puestoIds: ['puesto-fantasma'] } } }],
    ['comidas sin días', { ...comun, tipo: 'comidasEscalonadas', params: { dias: [], umbralJornadaMin: 480, duracionMin: 60, franjas: [{ inicio: 840, fin: 900, maxPersonas: 4 }] } }],
    ['comidas franjas solapadas', { ...comun, tipo: 'comidasEscalonadas', params: { dias: [6], umbralJornadaMin: 480, duracionMin: 60, franjas: [{ inicio: 840, fin: 920, maxPersonas: 4 }, { inicio: 900, fin: 960, maxPersonas: 4 }] } }],
    ['comidas maxPersonas 0', { ...comun, tipo: 'comidasEscalonadas', params: { dias: [6], umbralJornadaMin: 480, duracionMin: 60, franjas: [{ inicio: 840, fin: 900, maxPersonas: 0 }] } }],
    ['comidas más larga que la franja', { ...comun, tipo: 'comidasEscalonadas', params: { dias: [6], umbralJornadaMin: 480, duracionMin: 90, franjas: [{ inicio: 840, fin: 900, maxPersonas: 4 }] } }],
    ['comidas franja con fin ≤ inicio', { ...comun, tipo: 'comidasEscalonadas', params: { dias: [6], umbralJornadaMin: 480, duracionMin: 30, franjas: [{ inicio: 900, fin: 900, maxPersonas: 4 }] } }],
  ];
  it.each(casos)('%s da error', (_n, regla) => {
    expect(erroresRegla(regla, ejemplo).length).toBeGreaterThan(0);
  });
  it('franjas de comida que se tocan sin solaparse son válidas', () => {
    const r: ReglaGeneral = { ...comun, tipo: 'comidasEscalonadas', params: { dias: [6], umbralJornadaMin: 480, duracionMin: 60, franjas: [{ inicio: 840, fin: 900, maxPersonas: 4 }, { inicio: 900, fin: 960, maxPersonas: 4 }] } };
    expect(erroresRegla(r, ejemplo)).toEqual([]);
  });
});

describe('catálogo de restricciones', () => {
  it('los 10 tipos están en el registro y en el orden del selector', () => {
    expect([...TIPOS_RESTRICCION_ORDENADOS].sort()).toEqual([...TIPOS_RESTRICCION].sort());
    expect(Object.keys(METADATOS_RESTRICCION).sort()).toEqual([...TIPOS_RESTRICCION].sort());
  });
  it.each(TIPOS_RESTRICCION)('%s: crearRestriccion da una restricción válida y legible', (tipo) => {
    const r = crearRestriccion(tipo, ejemplo, 'restr-fijo');
    expect(r.id).toBe('restr-fijo');
    expect(r.tipo).toBe(tipo);
    expect(r.activa).toBe(true);
    expect(r.nota).toBe('');
    expect(r).not.toHaveProperty('estado');
    expect(r).not.toHaveProperty('nombre');
    expect(erroresRestriccion(r, ejemplo)).toEqual([]);
    sinTecnicismos(describirRestriccion(r, ejemplo));
  });
  it('sin id explícito usa prefijo restr-', () => {
    expect(crearRestriccion('soloFinesDeSemana', ejemplo).id).toMatch(/^restr-/);
  });
  it('peso 0 en una blanda da error', () => {
    const r = crearRestriccion('maxDiasSemana', ejemplo, 'r');
    expect(erroresRestriccion({ ...r, dura: false, peso: 0 }, ejemplo).length).toBeGreaterThan(0);
    expect(erroresRestriccion({ ...r, dura: false, peso: 2 }, ejemplo)).toEqual([]);
  });
  const comun = { id: 'r', activa: true, nota: '', dura: true, peso: 0 };
  const malas: [string, RestriccionPersona][] = [
    ['diasDisponibles vacío', { ...comun, tipo: 'diasDisponibles', params: { dias: [] } }],
    ['maxDiasSemana 0', { ...comun, tipo: 'maxDiasSemana', params: { max: 0 } }],
    ['maxDiasSemana 8', { ...comun, tipo: 'maxDiasSemana', params: { max: 8 } }],
    ['noAntesDe hora 25:00', { ...comun, tipo: 'noAntesDe', params: { hora: 1500, dias: [] } }],
    ['noDespuesDe hora negativa', { ...comun, tipo: 'noDespuesDe', params: { hora: -1, dias: [] } }],
    ['maxMinutosDia 0', { ...comun, tipo: 'maxMinutosDia', params: { maxMin: 0 } }],
    ['minutosSemana sin ningún límite', { ...comun, tipo: 'minutosSemana', params: { minMin: null, maxMin: null } }],
    ['minutosSemana mínimo mayor que máximo', { ...comun, tipo: 'minutosSemana', params: { minMin: 2000, maxMin: 1000 } }],
    ['noAsignarA con ámbito vacío', { ...comun, tipo: 'noAsignarA', params: { ambito: { areaIds: [], puestoIds: [] } } }],
    ['noAsignarA con área inexistente', { ...comun, tipo: 'noAsignarA', params: { ambito: { areaIds: ['area-fantasma'], puestoIds: [] } } }],
    ['pausaMinima con pausa 0', { ...comun, tipo: 'pausaMinima', params: { siJornadaSuperaMin: 480, pausaMin: 0 } }],
  ];
  it.each(malas)('%s da error', (_n, r) => {
    expect(erroresRestriccion(r, ejemplo).length).toBeGreaterThan(0);
  });
  it('minutosSemana con un solo límite es válido', () => {
    expect(erroresRestriccion({ ...comun, tipo: 'minutosSemana', params: { minMin: 600, maxMin: null } }, ejemplo)).toEqual([]);
  });
  it('descripciones de los ejemplos del catálogo', () => {
    const dias = crearRestriccion('diasNoDisponibles', ejemplo, 'r');
    expect(describirRestriccion({ ...dias, params: { dias: [4] } } as RestriccionPersona, ejemplo)).toBe('No trabaja el viernes');
    const nd = crearRestriccion('noDespuesDe', ejemplo, 'r');
    expect(describirRestriccion({ ...nd, params: { hora: 1200, dias: [] } } as RestriccionPersona, ejemplo))
      .toBe('No terminar después de las 20:00');
  });
});
