import { describe, expect, it } from 'vitest';
import type { EstadoApp, Persona } from '../modelo/tipos';
 import type { TipoReglaGeneral, TipoRestriccion } from '../modelo/tipos';
import { TIPOS_REGLA_GENERAL, TIPOS_RESTRICCION, comprobarCoherencia, normalizarCodigo, validarEstructura } from './coherencia';

function estadoMinimo(): EstadoApp {
  const franjas = [
    { id: 'f1', inicio: 600, fin: 690 },
    { id: 'f2', inicio: 690, fin: 780 },
  ];
  const persona = (n: number, alias: string | null): Persona => ({
    id: `p${n}`,
    codigo: `EMP-${String(n).padStart(2, '0')}`,
    alias,
    equipo: 'M',
    habilitaciones: ['a1'],
    activa: true,
    alta: null,
    baja: null,
    contratoMinSemana: null,
    objetivoCoberturaMinSemana: null,
    restricciones: [],
    patron: [],
  });
  return {
    config: { corteMananaTarde: 945, exportacionArea: 'diasEnColumnas', semilla: 1, limiteMotorMs: 3000 },
    areas: [{ id: 'a1', nombre: 'Caja', planta: 3, color: '#336699', icono: 'caja', activa: true, orden: 0 }],
    puestos: [
      {
        id: 'u1',
        areaId: 'a1',
        nombre: 'Caja 1',
        plazas: 1,
        dias: [0, 1, 2, 3, 4, 5, 6],
        horario: { general: { franjas, bloques: [{ id: 'b1', nombre: 'Mañana', franjaIds: ['f1', 'f2'] }] }, porDia: {} },
        requiereHabilitacion: true,
        activo: true,
        vigenteDesde: null,
        vigenteHasta: null,
        orden: 0,
      },
    ],
    personas: [persona(1, 'Alias ñandú'), persona(2, null)],
    reglas: [
      { id: 'r1', tipo: 'sinSolapes', params: {}, dura: true, peso: 1, activa: true, estado: 'pendiente', nombre: 'Sin solapes', nota: '' },
    ],
    rotacion: { longitudCiclo: 2, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B'] },
    semanasTipo: [],
    incidencias: [{ id: 'i1', tipo: 'ausencia', personaId: 'p2', desde: '2026-11-24', hasta: '2026-11-25', tramo: null, nota: '' }],
    cuadrantes: {
      '2026-11-23': {
        lunes: '2026-11-23',
        asignaciones: [
          { id: 's1', tipo: 'puesto', fecha: '2026-11-23', puestoId: 'u1', franjaId: 'f1', plaza: 0, personaId: 'p1', bloqueada: false, origen: 'manual' },
        ],
        meta: { modo: null, semilla: null, generado: null },
      },
    },
  };
}

describe('normalizarCodigo', () => {
  it('normaliza mayúsculas, espacios y ceros', () => {
    const k = normalizarCodigo('EMP-07');
    for (const x of ['emp 7', 'EMP_007', ' Emp7 ', 'EMP-7']) expect(normalizarCodigo(x)).toBe(k);
    expect(normalizarCodigo('EMP-00')).toBe('EMP0');
    expect(normalizarCodigo('EMP-10')).toBe('EMP10');
  });
  it('mantiene distintos EMP-17 y EMP-71', () => {
    expect(normalizarCodigo('EMP-17')).not.toBe(normalizarCodigo('EMP-71'));
  });
});

describe('validarEstructura', () => {
  it('acepta un estado correcto', () => {
    const e = estadoMinimo();
    const r = validarEstructura(e);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estado).toBe(e);
  });

  it('rechaza lo que no es un objeto', () => {
    for (const x of [null, 3, 'hola', [], undefined]) expect(validarEstructura(x).ok).toBe(false);
  });

  it('dice qué colección falta', () => {
    const { personas: _omitida, ...resto } = estadoMinimo();
    const r = validarEstructura(resto);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('«personas»');
  });

  it('dice qué campo de qué elemento falla', () => {
    const e = estadoMinimo() as unknown as { puestos: { inicio?: unknown; nombre?: unknown }[] };
    delete e.puestos[0]!.nombre;
    const r = validarEstructura(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/puestos\[1\].*«nombre»/);
  });

  it('exige inicio y fin numéricos en las franjas', () => {
    const e = estadoMinimo();
    (e.puestos[0]!.horario.general.franjas[0] as unknown as { inicio: string }).inicio = '10:00';
    const r = validarEstructura(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('«inicio»');
  });

  it('rechaza tipos incorrectos en colecciones y campos', () => {
    const base = estadoMinimo() as unknown as Record<string, unknown>;
    expect(validarEstructura({ ...base, areas: {} }).ok).toBe(false);
    expect(validarEstructura({ ...base, cuadrantes: [] }).ok).toBe(false);
    expect(validarEstructura({ ...base, config: { ...(base.config as object), semilla: 'x' } }).ok).toBe(false);
    const e = estadoMinimo();
    (e.personas[0] as unknown as { equipo: string }).equipo = 'Z';
    expect(validarEstructura(e).ok).toBe(false);
    const f = estadoMinimo();
    (f.cuadrantes['2026-11-23']!.asignaciones[0] as unknown as { personaId: number }).personaId = 4;
    expect(validarEstructura(f).ok).toBe(false);
  });
});

describe('validarEstructura: vigencia del puesto', () => {
  const conPuesto = (cambios: Record<string, unknown>) => {
    const e = structuredClone(estadoMinimo()) as unknown as { puestos: Record<string, unknown>[] };
    Object.assign(e.puestos[0]!, cambios);
    return e;
  };
  it('acepta fechas ISO o null', () => {
    expect(validarEstructura(conPuesto({ vigenteDesde: '2026-12-01', vigenteHasta: '2027-01-06' })).ok).toBe(true);
  });
  it('exige los dos campos', () => {
    const e = conPuesto({});
    delete e.puestos[0]!['vigenteHasta'];
    const r = validarEstructura(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(JSON.stringify(r)).toContain('vigenteHasta');
  });
  it('rechaza fechas imposibles o de otro tipo', () => {
    expect(validarEstructura(conPuesto({ vigenteDesde: '2026-02-31' })).ok).toBe(false);
    expect(validarEstructura(conPuesto({ vigenteDesde: 5 })).ok).toBe(false);
  });
});

describe('comprobarCoherencia', () => {
  it('no avisa con un estado coherente', () => {
    expect(comprobarCoherencia(estadoMinimo())).toEqual([]);
  });

  it('avisa de códigos casi duplicados (EMP-07 / emp-7)', () => {
    const e = estadoMinimo();
    e.personas[0]!.codigo = 'EMP-07';
    e.personas[1]!.codigo = 'emp-7';
    const avisos = comprobarCoherencia(e);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('EMP-07');
    expect(avisos[0]).toContain('emp-7');
  });

  it('avisa de códigos exactamente repetidos', () => {
    const e = estadoMinimo();
    e.personas[1]!.codigo = e.personas[0]!.codigo;
    expect(comprobarCoherencia(e).join(' ')).toContain('repetido');
  });

  it('avisa de referencias huérfanas', () => {
    const e = estadoMinimo();
    e.puestos[0]!.areaId = 'nada';
    e.personas[0]!.habilitaciones = ['inexistente'];
    e.puestos[0]!.horario.general.bloques[0]!.franjaIds = ['f1', 'f9'];
    e.cuadrantes['2026-11-23']!.asignaciones.push({
      id: 's2', tipo: 'puesto', fecha: '2026-11-23', puestoId: 'u9', franjaId: 'f1', plaza: 0, personaId: 'p9', bloqueada: false, origen: 'manual',
    });
    e.incidencias.push({ id: 'i2', tipo: 'puestoCerrado', puestoId: 'u8', desde: '2026-11-23', hasta: '2026-11-23', nota: '' });
    e.incidencias.push({ id: 'i3', tipo: 'ausencia', personaId: 'p7', desde: '2026-11-23', hasta: '2026-11-23', tramo: null, nota: '' });
    e.semanasTipo.push({
      id: 'st', indiceCiclo: 0, nombre: 'A',
      asignaciones: [{ id: 'x', tipo: 'puesto', dia: 0, puestoId: 'u1', franjaId: 'f7', plaza: 0, personaId: 'p1', bloqueada: false }],
    });
    const texto = comprobarCoherencia(e).join('\n');
    expect(texto).toContain('área que no existe');
    expect(texto).toContain('EMP-01 tiene una habilitación');
    expect(texto).toContain('franjas que no existen');
    expect(texto).toContain('persona que no existe');
    expect(texto).toContain('puesto que no existe');
    expect(texto).toContain('Una ausencia');
    expect(texto).toContain('Un cierre de puesto');
    expect(texto).toContain('Semana tipo');
  });

  it('avisa de franjas mal formadas y solapadas', () => {
    const e = estadoMinimo();
    const franjas = e.puestos[0]!.horario.general.franjas;
    franjas.push({ id: 'f3', inicio: 800, fin: 800 });
    franjas[1]!.inicio = 650;
    const avisos = comprobarCoherencia(e).join('\n');
    expect(avisos).toContain('termina antes de empezar');
    expect(avisos).toContain('se solapan');
  });

  it('franjas que solo se tocan no se solapan', () => {
    expect(comprobarCoherencia(estadoMinimo())).toEqual([]);
  });
});

describe('listas de tipos', () => {
  it('están completas frente a los tipos', () => {
    const reglas: Record<TipoReglaGeneral, true> = {
      sinSolapes: true, coberturaCompleta: true, personaDisponible: true, habilitacionRequerida: true, maxMinutosDia: true,
      descansoEntreJornadas: true, exclusividadDiaria: true, respetarEquipo: true, maxFranjasSiSoloArea: true, comidasEscalonadas: true,
      noRepetirConsecutivas: true, mismaPersonaBloque: true, rotarEntreBloques: true, maxDiasSemana: true, repartoEquitativo: true,
    };
    const restr: Record<TipoRestriccion, true> = {
      diasDisponibles: true, diasNoDisponibles: true, noAntesDe: true, noDespuesDe: true, maxMinutosDia: true,
      minutosSemana: true, maxDiasSemana: true, soloFinesDeSemana: true, noAsignarA: true, pausaMinima: true,
    };
    expect([...TIPOS_REGLA_GENERAL].sort()).toEqual(Object.keys(reglas).sort());
    expect([...TIPOS_RESTRICCION].sort()).toEqual(Object.keys(restr).sort());
  });
});

describe('validarEstructura (fase 1, revisión)', () => {
  const error = (e: unknown): string => {
    const r = validarEstructura(e);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.error;
  };
  const restr = (e: EstadoApp, tipo: string, params: unknown): void => {
    e.personas[0]!.restricciones.push({ id: 'x', tipo, activa: true, dura: true, peso: 1, params } as never);
  };

  it('rechaza tipos de regla y restricción desconocidos', () => {
    const e = estadoMinimo();
    (e.reglas[0] as { tipo: string }).tipo = 'inventada';
    expect(error(e)).toContain('«inventada»');
    const f = estadoMinimo();
    restr(f, 'rara', {});
    expect(error(f)).toContain('«rara»');
  });

  it('exige params objeto', () => {
    const e = estadoMinimo();
    (e.reglas[0] as { params: unknown }).params = 3;
    expect(error(e)).toContain('params');
  });

  it('rechaza un icono inválido', () => {
    const e = estadoMinimo();
    (e.areas[0] as { icono: string }).icono = 'cohete';
    expect(error(e)).toContain('icono');
  });

  it('rechaza días fuera de 0–6', () => {
    const a = estadoMinimo();
    a.puestos[0]!.dias = [0, 7] as never;
    expect(error(a)).toContain('día fuera');
    const b = estadoMinimo();
    (b.puestos[0]!.horario.porDia as Record<string, unknown>)['9'] = { franjas: [], bloques: [] };
    expect(error(b)).toContain('porDia');
    const c = estadoMinimo();
    restr(c, 'diasDisponibles', { dias: [8] });
    expect(error(c)).toContain('día fuera');
    const d = estadoMinimo();
    d.personas[0]!.patron = [{ indiceCiclo: 0, equipo: null, diasLibres: [-1 as never] }];
    expect(error(d)).toContain('día fuera');
    const f = estadoMinimo();
    f.semanasTipo.push({
      id: 'st', indiceCiclo: 0, nombre: 'A',
      asignaciones: [{ id: 'x', tipo: 'puesto', dia: 7 as never, puestoId: 'u1', franjaId: 'f1', plaza: 0, personaId: 'p1', bloqueada: false }],
    });
    expect(error(f)).toContain('día fuera');
  });

  it('rechaza fechas inválidas', () => {
    const a = estadoMinimo();
    a.personas[0]!.alta = '2026-13-01';
    expect(error(a)).toContain('«alta»');
    const b = estadoMinimo();
    b.rotacion.lunesReferencia = 'lunes';
    expect(error(b)).toContain('lunesReferencia');
    const c = estadoMinimo();
    (c.incidencias[0] as { hasta: string }).hasta = '2026-02-30';
    expect(error(c)).toContain('«hasta»');
    const d = estadoMinimo();
    (d.cuadrantes['2026-11-23']!.asignaciones[0] as { fecha: string }).fecha = 'x';
    expect(error(d)).toContain('«fecha»');
    const f = estadoMinimo();
    f.cuadrantes['mal'] = { ...f.cuadrantes['2026-11-23']!, lunes: 'mal' };
    expect(error(f)).toContain('fecha válida');
  });

  it('rechaza ids duplicados', () => {
    const a = estadoMinimo();
    a.personas[1]!.id = 'p1';
    expect(error(a)).toContain('personas');
    const b = estadoMinimo();
    const fr = b.puestos[0]!.horario.general.franjas;
    fr[1]!.id = fr[0]!.id;
    expect(error(b)).toContain('franjas');
  });
});

describe('comprobarCoherencia (fase 1, revisión)', () => {
  it('comprueba contra el horario efectivo del día, con nombres de día', () => {
    const e = estadoMinimo();
    const p = e.puestos[0]!;
    p.horario.porDia = { 6: { franjas: [{ id: 'd1', inicio: 600, fin: 700 }], bloques: [{ id: 'bd', nombre: 'Dom', franjaIds: ['f1'] }] } };
    // 2026-11-29 es domingo: f1 no existe en el horario del domingo.
    e.cuadrantes['2026-11-23']!.asignaciones.push({
      id: 's9', tipo: 'puesto', fecha: '2026-11-29', puestoId: 'u1', franjaId: 'f1', plaza: 0, personaId: 'p1', bloqueada: false, origen: 'manual',
    });
    const t = comprobarCoherencia(e).join('\n');
    expect(t).toContain('(domingo)');
    expect(t).toContain('el domingo');
    expect(t).not.toContain('(6)');
    // El lunes sigue usando el horario general: f1 vale.
    expect(comprobarCoherencia(estadoMinimo())).toEqual([]);
  });

  it('usa «horario general» en los mensajes', () => {
    const e = estadoMinimo();
    e.puestos[0]!.horario.general.bloques[0]!.franjaIds = ['f9'];
    expect(comprobarCoherencia(e).join('')).toContain('(horario general)');
  });

  it('avisa de referencias huérfanas en params de reglas y restricciones', () => {
    const e = estadoMinimo();
    e.reglas.push({
      id: 'r2', tipo: 'exclusividadDiaria', params: { puestoIds: ['u1', 'zz'], diasExcepcion: [] }, dura: true, peso: 1, activa: true, estado: 'pendiente', nombre: 'Excl', nota: '',
    } as never);
    e.reglas.push({
      id: 'r3', tipo: 'maxFranjasSiSoloArea', params: { areaId: 'nada', maxFranjas: 2 }, dura: true, peso: 1, activa: true, estado: 'pendiente', nombre: 'MaxF', nota: '',
    } as never);
    e.personas[0]!.restricciones.push({
      id: 'x', tipo: 'noAsignarA', activa: true, dura: true, peso: 1, params: { ambito: { areaIds: ['a1', 'qq'], puestoIds: [] } },
    } as never);
    const t = comprobarCoherencia(e).join('\n');
    expect(t).toContain('«Excl» se refiere a un puesto que no existe');
    expect(t).toContain('«MaxF» se refiere a un área que no existe');
    expect(t).toContain('restricción de EMP-01');
  });
});
