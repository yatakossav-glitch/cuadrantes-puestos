/** Caja negra: datos de ejemplo frente a §10 de la especificación y ARQUITECTURA.md §8.1. */
import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, crearEstadoVacio, IDS_EJEMPLO } from '../../src/datos-ejemplo/ejemplo';
import { aMinutos, duracion, seSolapan } from '../../src/modelo/horas';
import type { Franja, Puesto } from '../../src/modelo/tipos';

const e = () => crearEstadoEjemplo();
const puesto = (id: string): Puesto => {
  const p = e().puestos.find((x) => x.id === id);
  if (!p) throw new Error(`Falta el puesto ${id}`);
  return p;
};
const franjas = (id: string): Franja[] => [...puesto(id).horario.general.franjas].sort((a, b) => a.inicio - b.inicio);
const CORTE = aMinutos('15:45');

describe('datos de ejemplo · estructura general', () => {
  it('config: corte 15:45, semilla 1, 3000 ms, diasEnColumnas', () => {
    const c = e().config;
    expect(c.corteMananaTarde).toBe(945);
    expect(c.exportacionArea).toBe('diasEnColumnas');
    expect(c.semilla).toBe(1);
    expect(c.limiteMotorMs).toBe(3000);
  });

  it('cada llamada devuelve una copia nueva e independiente', () => {
    const a = crearEstadoEjemplo();
    a.personas[0]!.alias = 'cambiado';
    a.puestos.pop();
    const b = crearEstadoEjemplo();
    expect(b.personas[0]!.alias).toBeNull();
    expect(b.puestos.length).toBe(4);
  });

  it('IDS_EJEMPLO apunta a áreas y puestos existentes', () => {
    const s = e();
    for (const id of Object.values(IDS_EJEMPLO.areas)) expect(s.areas.some((a) => a.id === id)).toBe(true);
    for (const id of Object.values(IDS_EJEMPLO.puestos)) expect(s.puestos.some((p) => p.id === id)).toBe(true);
    expect(Object.keys(IDS_EJEMPLO.areas).sort()).toEqual(['caja', 'lego', 'libreria', 'pedidos']);
    expect(Object.keys(IDS_EJEMPLO.puestos).sort()).toEqual(['caja1', 'caja2', 'lego', 'pedidos']);
  });

  it('ids únicos dentro de cada colección', () => {
    const s = e();
    for (const lista of [s.areas, s.puestos, s.personas, s.reglas]) {
      const ids = lista.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('sin semanas tipo, incidencias ni cuadrantes; rotación A/B desde 2026-11-23', () => {
    const s = e();
    expect(s.semanasTipo).toEqual([]);
    expect(s.incidencias).toEqual([]);
    expect(s.cuadrantes).toEqual({});
    expect(s.rotacion.longitudCiclo).toBe(2);
    expect(s.rotacion.etiquetas).toEqual(['A', 'B']);
    expect(s.rotacion.lunesReferencia).toBe('2026-11-23');
  });

  it('estado vacío: nada de áreas, puestos, personas ni reglas; config por defecto', () => {
    const v = crearEstadoVacio();
    expect(v.areas).toEqual([]);
    expect(v.puestos).toEqual([]);
    expect(v.personas).toEqual([]);
    expect(v.reglas).toEqual([]);
    expect(v.cuadrantes).toEqual({});
    expect(v.config.corteMananaTarde).toBe(945);
  });
});

describe('datos de ejemplo · áreas (§10)', () => {
  it('planta 3: Pedidos, Caja y LEGO activas con sus iconos', () => {
    const s = e();
    const porId = (id: string) => s.areas.find((a) => a.id === id)!;
    const { pedidos, caja, lego } = IDS_EJEMPLO.areas;
    expect(porId(pedidos).icono).toBe('paquete');
    expect(porId(caja).icono).toBe('caja');
    expect(porId(lego).icono).toBe('bloques');
    for (const id of [pedidos, caja, lego]) {
      expect(porId(id).planta).toBe(3);
      expect(porId(id).activa).toBe(true);
    }
  });

  it('planta 4 (Librería) presente, inactiva y sin puestos', () => {
    const s = e();
    const lib = s.areas.find((a) => a.id === IDS_EJEMPLO.areas.libreria)!;
    expect(lib.planta).toBe(4);
    expect(lib.activa).toBe(false);
    expect(lib.icono).toBe('libro');
    expect(s.puestos.filter((p) => p.areaId === lib.id)).toEqual([]);
  });

  it('el modelo admite varias plantas', () => {
    expect(new Set(e().areas.map((a) => a.planta))).toEqual(new Set([3, 4]));
  });
});

describe('datos de ejemplo · 4 plazas simultáneas de 10:00 a 22:00, 7 días', () => {
  it('hay 4 puestos, todos activos, 1 plaza, los 7 días, sin horario por día', () => {
    const s = e();
    expect(s.puestos).toHaveLength(4);
    for (const p of s.puestos) {
      expect(p.activo).toBe(true);
      expect(p.plazas).toBe(1);
      expect([...p.dias].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(p.horario.porDia).toEqual({});
      expect(p.requiereHabilitacion).toBe(true);
    }
  });

  it.each(['pedidos', 'caja1', 'caja2', 'lego'] as const)('%s cubre 10:00–22:00 sin huecos ni solapes', (clave) => {
    const f = franjas(IDS_EJEMPLO.puestos[clave]);
    expect(f[0]!.inicio).toBe(600);
    expect(f[f.length - 1]!.fin).toBe(1320);
    for (let i = 1; i < f.length; i++) {
      expect(f[i]!.inicio).toBe(f[i - 1]!.fin); // se tocan, no se solapan
      expect(seSolapan(f[i - 1]!, f[i]!)).toBe(false);
    }
    // identificador de franja único dentro del puesto
    expect(new Set(f.map((x) => x.id)).size).toBe(f.length);
  });

  it('en cualquier minuto de 10:00 a 22:00 hay exactamente 4 plazas abiertas', () => {
    const s = e();
    for (const minuto of [600, 601, 700, 944, 945, 946, 1000, 1319]) {
      let abiertas = 0;
      for (const p of s.puestos) {
        for (const f of p.horario.general.franjas) if (f.inicio <= minuto && minuto < f.fin) abiertas += p.plazas;
      }
      expect(abiertas).toBe(4);
    }
  });

  it('las plazas pertenecen a las áreas correctas', () => {
    const { areas, puestos } = IDS_EJEMPLO;
    expect(puesto(puestos.pedidos).areaId).toBe(areas.pedidos);
    expect(puesto(puestos.caja1).areaId).toBe(areas.caja);
    expect(puesto(puestos.caja2).areaId).toBe(areas.caja);
    expect(puesto(puestos.lego).areaId).toBe(areas.lego);
  });
});

describe('datos de ejemplo · Pedidos Web', () => {
  it('requiere habilitación; mañana 10:00–15:45 y tarde 15:45–22:00; sin bloques', () => {
    const p = puesto(IDS_EJEMPLO.puestos.pedidos);
    expect(p.requiereHabilitacion).toBe(true);
    const f = franjas(p.id);
    expect(f.map((x) => [x.inicio, x.fin])).toEqual([
      [aMinutos('10:00'), aMinutos('15:45')],
      [aMinutos('15:45'), aMinutos('22:00')],
    ]);
    expect(p.horario.general.bloques).toEqual([]);
  });
});

describe('datos de ejemplo · Caja', () => {
  const esperadas = ['10:00-11:30', '11:30-13:00', '13:00-14:30', '14:30-15:45', '15:45-17:20', '17:20-19:00', '19:00-20:40', '20:40-22:00'];
  const bloquesEsperados = [
    ['10:00', '13:00'],
    ['13:00', '15:45'],
    ['15:45', '19:00'],
    ['19:00', '22:00'],
  ];
  it.each(['caja1', 'caja2'] as const)('%s: 8 franjas exactas', (clave) => {
    const f = franjas(IDS_EJEMPLO.puestos[clave]);
    expect(f).toHaveLength(8);
    const texto = f.map((x) => {
      const h = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return `${h(x.inicio)}-${h(x.fin)}`;
    });
    expect(texto).toEqual(esperadas);
  });

  it.each(['caja1', 'caja2'] as const)('%s: 4 bloques de 2 franjas consecutivas', (clave) => {
    const p = puesto(IDS_EJEMPLO.puestos[clave]);
    const f = franjas(p.id);
    const bloques = p.horario.general.bloques;
    expect(bloques).toHaveLength(4);
    const usadas = new Set<string>();
    const rangos = bloques.map((b) => {
      expect(b.franjaIds).toHaveLength(2);
      const fs = b.franjaIds.map((id) => f.find((x) => x.id === id)!);
      for (const x of fs) {
        expect(x).toBeDefined();
        expect(usadas.has(x.id)).toBe(false); // una franja pertenece como mucho a un bloque
        usadas.add(x.id);
      }
      fs.sort((a, c) => a.inicio - c.inicio);
      expect(fs[0]!.fin).toBe(fs[1]!.inicio);
      return [fs[0]!.inicio, fs[1]!.fin];
    });
    rangos.sort((a, c) => a[0]! - c[0]!);
    expect(rangos).toEqual(bloquesEsperados.map(([a, b]) => [aMinutos(a!), aMinutos(b!)]));
    expect(usadas.size).toBe(8);
  });

  it('ningún bloque cruza el corte 15:45', () => {
    const p = puesto(IDS_EJEMPLO.puestos.caja1);
    const f = franjas(p.id);
    for (const b of p.horario.general.bloques) {
      const fs = b.franjaIds.map((id) => f.find((x) => x.id === id)!);
      const inicio = Math.min(...fs.map((x) => x.inicio));
      const fin = Math.max(...fs.map((x) => x.fin));
      expect(inicio >= CORTE || fin <= CORTE).toBe(true);
    }
  });
});

describe('datos de ejemplo · Exposición LEGO', () => {
  const f = () => franjas(IDS_EJEMPLO.puestos.lego);
  it('11 franjas: 6 de mañana de 57–58 min y 5 de tarde de 75 min', () => {
    expect(f()).toHaveLength(11);
    const manana = f().filter((x) => x.inicio < CORTE);
    const tarde = f().filter((x) => x.inicio >= CORTE);
    expect(manana).toHaveLength(6);
    expect(tarde).toHaveLength(5);
    for (const x of manana) expect([57, 58]).toContain(duracion(x));
    for (const x of tarde) expect(duracion(x)).toBe(75);
    expect(manana[0]!.inicio).toBe(600);
    expect(manana[5]!.fin).toBe(CORTE);
    expect(tarde[0].inicio).toBe(CORTE);
    expect(tarde[4].fin).toBe(1320);
  });
  it('sin bloques (nadie repite, cada franja es independiente)', () => {
    expect(puesto(IDS_EJEMPLO.puestos.lego).horario.general.bloques).toEqual([]);
  });
});

describe('datos de ejemplo · personas', () => {
  it('29 personas EMP-01..EMP-29, sin alias, activas, sin alta/baja', () => {
    const ps = e().personas;
    expect(ps).toHaveLength(29);
    expect(ps.map((p) => p.codigo)).toEqual(Array.from({ length: 29 }, (_, i) => `EMP-${String(i + 1).padStart(2, '0')}`));
    for (const p of ps) {
      expect(p.alias).toBeNull();
      expect(p.activa).toBe(true);
      expect(p.alta).toBeNull();
      expect(p.baja).toBeNull();
      expect(p.contratoMinSemana).toBeNull();
      expect(p.objetivoCoberturaMinSemana).toBeNull();
      expect(['M', 'T', 'A']).toContain(p.equipo);
    }
  });

  it('exactamente 2 personas de equipo A y el resto repartido M/T de forma equilibrada', () => {
    const ps = e().personas;
    expect(ps.filter((p) => p.equipo === 'A')).toHaveLength(2);
    const m = ps.filter((p) => p.equipo === 'M').length;
    const t = ps.filter((p) => p.equipo === 'T').length;
    expect(m + t).toBe(27);
    expect(Math.abs(m - t)).toBeLessThanOrEqual(4);
  });

  it('perfiles de habilitación del §10: 6/10/3/2/3/5', () => {
    const { pedidos, caja, lego } = IDS_EJEMPLO.areas;
    const conteo = new Map<string, number>();
    for (const p of e().personas) {
      const clave = [pedidos, caja, lego].map((a) => (p.habilitaciones.includes(a) ? '1' : '0')).join('');
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
    expect(conteo.get('111')).toBe(6); // Pedidos+Caja+LEGO
    expect(conteo.get('011')).toBe(10); // Caja+LEGO
    expect(conteo.get('110')).toBe(3); // Pedidos+Caja
    expect(conteo.get('101')).toBe(2); // Pedidos+LEGO
    expect(conteo.get('100')).toBe(3); // solo Pedidos
    expect(conteo.get('001')).toBe(5); // solo LEGO
    expect([...conteo.values()].reduce((a, b) => a + b, 0)).toBe(29);
  });

  it('habilitaciones y restricciones apuntan a ids existentes', () => {
    const s = e();
    const ids = new Set([...s.areas.map((a) => a.id), ...s.puestos.map((p) => p.id)]);
    for (const p of s.personas) for (const h of p.habilitaciones) expect(ids.has(h)).toBe(true);
  });

  it('tres restricciones de muestra: diasNoDisponibles blanda, soloFinesDeSemana dura, noDespuesDe 20:00 dura', () => {
    const todas = e().personas.flatMap((p) => p.restricciones);
    expect(todas).toHaveLength(3);
    const por = (t: string) => todas.filter((r) => r.tipo === t);
    expect(por('diasNoDisponibles')).toHaveLength(1);
    expect(por('diasNoDisponibles')[0].dura).toBe(false);
    expect(por('soloFinesDeSemana')).toHaveLength(1);
    expect(por('soloFinesDeSemana')[0].dura).toBe(true);
    expect(por('noDespuesDe')).toHaveLength(1);
    expect(por('noDespuesDe')[0].dura).toBe(true);
    expect((por('noDespuesDe')[0].params as { hora: number }).hora).toBe(aMinutos('20:00'));
  });

  it('privacidad: códigos EMP-NN, alias nulos y notas vacías', () => {
    const s = e();
    for (const p of s.personas) {
      expect(p.codigo).toMatch(/^EMP-\d{2}$/);
      expect(p.alias).toBeNull();
      for (const r of p.restricciones) expect(r.nota).toBe('');
    }
    expect(JSON.stringify(s)).not.toMatch(/"alias":"/);
  });
});

describe('datos de ejemplo · reglas (todas «pendiente»)', () => {
  const reglas = () => e().reglas;
  const porTipo = (t: string) => reglas().filter((r) => r.tipo === t);

  it('todas en estado pendiente', () => {
    expect(reglas().length).toBeGreaterThanOrEqual(15);
    for (const r of reglas()) expect(r.estado).toBe('pendiente');
  });

  it('están todos los tipos del catálogo inicial', () => {
    const tipos = new Set(reglas().map((r) => r.tipo));
    for (const t of [
      'sinSolapes', 'coberturaCompleta', 'personaDisponible', 'habilitacionRequerida', 'maxMinutosDia',
      'noRepetirConsecutivas', 'mismaPersonaBloque', 'rotarEntreBloques', 'exclusividadDiaria', 'respetarEquipo',
      'maxDiasSemana', 'maxFranjasSiSoloArea', 'comidasEscalonadas', 'descansoEntreJornadas', 'repartoEquitativo',
    ]) expect(tipos.has(t as never)).toBe(true);
  });

  it('descansoEntreJornadas (12 h) existe pero está inactiva: no observada', () => {
    const r = porTipo('descansoEntreJornadas')[0];
    expect(r.activa).toBe(false);
    expect((r.params as { minMin: number }).minMin).toBe(720);
  });

  it('el resto de reglas están activas', () => {
    for (const r of reglas()) if (r.tipo !== 'descansoEntreJornadas') expect(r.activa).toBe(true);
  });

  it('durezas: las obligatorias son duras; rotarEntreBloques, maxFranjasSiSoloArea y repartoEquitativo, blandas con peso', () => {
    for (const t of ['sinSolapes', 'coberturaCompleta', 'personaDisponible', 'habilitacionRequerida', 'maxMinutosDia', 'noRepetirConsecutivas', 'mismaPersonaBloque', 'exclusividadDiaria', 'respetarEquipo', 'maxDiasSemana', 'comidasEscalonadas']) {
      expect(porTipo(t)[0].dura).toBe(true);
    }
    expect(porTipo('rotarEntreBloques')[0]).toMatchObject({ dura: false, peso: 5 });
    expect(porTipo('maxFranjasSiSoloArea')[0]).toMatchObject({ dura: false, peso: 10 });
    expect(porTipo('repartoEquitativo')[0]).toMatchObject({ dura: false, peso: 1 });
  });

  it('máximo diario 4h30 (270) con excepción de Pedidos sin límite', () => {
    const p = porTipo('maxMinutosDia')[0].params as { maxMin: number; excepciones: { areaId: string; maxMin: number | null }[] };
    expect(p.maxMin).toBe(270);
    expect(p.excepciones).toEqual([{ areaId: IDS_EJEMPLO.areas.pedidos, maxMin: null }]);
  });

  it('ámbitos: LEGO no repite; Caja misma persona por bloque y rotación', () => {
    const lego = IDS_EJEMPLO.areas.lego;
    const caja = IDS_EJEMPLO.areas.caja;
    const cubre = (r: { params: unknown }, id: string) => {
      const a = (r.params as { ambito: { areaIds: string[]; puestoIds: string[] } }).ambito;
      return a.areaIds.includes(id) || a.puestoIds.length > 0;
    };
    expect(cubre(porTipo('noRepetirConsecutivas')[0], lego)).toBe(true);
    expect(cubre(porTipo('mismaPersonaBloque')[0], caja)).toBe(true);
    expect(cubre(porTipo('rotarEntreBloques')[0], caja)).toBe(true);
  });

  it('exclusividad de Pedidos con excepción el domingo; equipo al contrario 1 día solo domingo; máx. 6 días', () => {
    expect(porTipo('exclusividadDiaria')[0].params).toMatchObject({ puestoIds: [IDS_EJEMPLO.puestos.pedidos], diasExcepcion: [6] });
    expect(porTipo('respetarEquipo')[0].params).toMatchObject({ maxDiasContrarioSemana: 1, diasPermitidos: [6] });
    expect(porTipo('maxDiasSemana')[0].params).toMatchObject({ max: 6 });
    expect(porTipo('maxFranjasSiSoloArea')[0].params).toMatchObject({ areaId: IDS_EJEMPLO.areas.lego, maxFranjas: 1 });
  });

  it('comidas del domingo: umbral 8 h, 60 min, 14–15 (4), 15–16 (4), 16–17 (3)', () => {
    const p = porTipo('comidasEscalonadas')[0].params as {
      dias: number[]; umbralJornadaMin: number; duracionMin: number; franjas: { inicio: number; fin: number; maxPersonas: number }[];
    };
    expect(p.dias).toEqual([6]);
    expect(p.umbralJornadaMin).toBe(480);
    expect(p.duracionMin).toBe(60);
    expect(p.franjas).toEqual([
      { inicio: 840, fin: 900, maxPersonas: 4 },
      { inicio: 900, fin: 960, maxPersonas: 4 },
      { inicio: 960, fin: 1020, maxPersonas: 3 },
    ]);
  });
});
