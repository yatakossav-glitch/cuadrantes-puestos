/**
 * Datos de ejemplo (ficticios): planta 3 con Pedidos Web, Caja y Exposición LEGO,
 * 29 personas EMP-01…EMP-29 y las reglas observadas, todas en estado «pendiente».
 * Cada llamada devuelve objetos nuevos e independientes.
 */
import { aMinutos } from '../modelo/horas';
import type {
  Ambito,
  Area,
  Bloque,
  DiaSemana,
  EstadoApp,
  Equipo,
  Franja,
  Id,
  Persona,
  Puesto,
  ReglaGeneral,
  RestriccionPersona,
} from '../modelo/tipos';

export const IDS_EJEMPLO = {
  areas: {
    pedidos: 'area-pedidos',
    caja: 'area-caja',
    lego: 'area-lego',
    libreria: 'area-libreria',
  },
  puestos: {
    pedidos: 'puesto-pedidos',
    caja1: 'puesto-caja1',
    caja2: 'puesto-caja2',
    lego: 'puesto-lego',
  },
} as const;

const TODOS_LOS_DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];

/** Crea franjas contiguas a partir de una lista de horas «HH:MM» (n+1 horas → n franjas). */
function franjasDesdeHoras(prefijo: string, horas: string[]): Franja[] {
  const minutos = horas.map(aMinutos);
  return minutos.slice(0, -1).map((inicio, i) => ({
    id: `${prefijo}-${i + 1}`,
    inicio,
    fin: minutos[i + 1]!,
  }));
}

function crearAreas(): Area[] {
  return [
    { id: IDS_EJEMPLO.areas.pedidos, nombre: 'Pedidos Web', planta: 3, color: '#2f6fb0', icono: 'paquete', activa: true, orden: 1 },
    { id: IDS_EJEMPLO.areas.caja, nombre: 'Caja', planta: 3, color: '#2e8b57', icono: 'caja', activa: true, orden: 2 },
    { id: IDS_EJEMPLO.areas.lego, nombre: 'Exposición LEGO', planta: 3, color: '#c9892b', icono: 'bloques', activa: true, orden: 3 },
    { id: IDS_EJEMPLO.areas.libreria, nombre: 'Librería', planta: 4, color: '#8a5cb5', icono: 'libro', activa: false, orden: 4 },
  ];
}

function crearPuestos(): Puesto[] {
  const base = () => ({
    plazas: 1,
    dias: [...TODOS_LOS_DIAS],
    requiereHabilitacion: true,
    activo: true,
    vigenteDesde: null,
    vigenteHasta: null,
  });

  const franjasPedidos: Franja[] = [
    { id: 'franja-pedidos-m', inicio: aMinutos('10:00'), fin: aMinutos('15:45') },
    { id: 'franja-pedidos-t', inicio: aMinutos('15:45'), fin: aMinutos('22:00') },
  ];

  const crearFranjasCaja = (): Franja[] =>
    franjasDesdeHoras('franja-caja', ['10:00', '11:30', '13:00', '14:30', '15:45', '17:20', '19:00', '20:40', '22:00']);
  const crearBloquesCaja = (): Bloque[] => [
    { id: 'bloque-caja-m1', nombre: '10:00–13:00', franjaIds: ['franja-caja-1', 'franja-caja-2'] },
    { id: 'bloque-caja-m2', nombre: '13:00–15:45', franjaIds: ['franja-caja-3', 'franja-caja-4'] },
    { id: 'bloque-caja-t1', nombre: '15:45–19:00', franjaIds: ['franja-caja-5', 'franja-caja-6'] },
    { id: 'bloque-caja-t2', nombre: '19:00–22:00', franjaIds: ['franja-caja-7', 'franja-caja-8'] },
  ];

  const franjasLego = franjasDesdeHoras('franja-lego', [
    '10:00', '10:58', '11:55', '12:53', '13:50', '14:48', '15:45', '17:00', '18:15', '19:30', '20:45', '22:00',
  ]);

  return [
    {
      ...base(),
      id: IDS_EJEMPLO.puestos.pedidos,
      areaId: IDS_EJEMPLO.areas.pedidos,
      nombre: 'Puesto único',
      horario: { general: { franjas: franjasPedidos, bloques: [] }, porDia: {} },
      orden: 1,
    },
    {
      ...base(),
      id: IDS_EJEMPLO.puestos.caja1,
      areaId: IDS_EJEMPLO.areas.caja,
      nombre: 'Caja 1',
      horario: { general: { franjas: crearFranjasCaja(), bloques: crearBloquesCaja() }, porDia: {} },
      orden: 2,
    },
    {
      ...base(),
      id: IDS_EJEMPLO.puestos.caja2,
      areaId: IDS_EJEMPLO.areas.caja,
      nombre: 'Caja 2',
      horario: { general: { franjas: crearFranjasCaja(), bloques: crearBloquesCaja() }, porDia: {} },
      orden: 3,
    },
    {
      ...base(),
      id: IDS_EJEMPLO.puestos.lego,
      areaId: IDS_EJEMPLO.areas.lego,
      nombre: 'Puesto único',
      horario: { general: { franjas: franjasLego, bloques: [] }, porDia: {} },
      orden: 4,
    },
  ];
}

/** Perfiles de habilitación, en orden, con la cantidad de personas y el reparto de equipos. */
const PERFILES: { areas: Id[]; equipos: Equipo[] }[] = (() => {
  const { pedidos, caja, lego } = IDS_EJEMPLO.areas;
  return [
    { areas: [pedidos, caja, lego], equipos: ['M', 'T', 'M', 'T', 'M', 'T'] },
    { areas: [caja, lego], equipos: ['M', 'T', 'M', 'T', 'M', 'T', 'M', 'T', 'M', 'A'] },
    { areas: [pedidos, caja], equipos: ['M', 'T', 'M'] },
    { areas: [pedidos, lego], equipos: ['M', 'T'] },
    { areas: [pedidos], equipos: ['M', 'T', 'M'] },
    { areas: [lego], equipos: ['M', 'T', 'M', 'T', 'A'] },
  ];
})();

function crearPersonas(): Persona[] {
  const personas: Persona[] = [];
  let n = 0;
  for (const perfil of PERFILES) {
    for (const equipo of perfil.equipos) {
      n += 1;
      const num = String(n).padStart(2, '0');
      personas.push({
        id: `per-${num}`,
        codigo: `EMP-${num}`,
        alias: null,
        equipo,
        habilitaciones: [...perfil.areas],
        activa: true,
        alta: null,
        baja: null,
        contratoMinSemana: null,
        objetivoCoberturaMinSemana: null,
        restricciones: [],
        patron: [],
      });
    }
  }

  const restriccionesMuestra: Record<string, RestriccionPersona> = {
    'per-03': { id: 'restr-no-viernes', tipo: 'diasNoDisponibles', params: { dias: [4] }, dura: false, peso: 5, activa: true, nota: '' },
    'per-08': { id: 'restr-solo-finde', tipo: 'soloFinesDeSemana', params: {}, dura: true, peso: 0, activa: true, nota: '' },
    'per-12': { id: 'restr-no-despues-20', tipo: 'noDespuesDe', params: { hora: aMinutos('20:00'), dias: [] }, dura: true, peso: 0, activa: true, nota: '' },
  };
  for (const p of personas) {
    const r = restriccionesMuestra[p.id];
    if (r) p.restricciones.push(r);
  }
  return personas;
}

function crearReglas(): ReglaGeneral[] {
  const { pedidos, caja, lego } = IDS_EJEMPLO.areas;
  const ambito = (areaId: Id): Ambito => ({ areaIds: [areaId], puestoIds: [] });
  const comun = { activa: true, estado: 'pendiente' as const, nota: '' };
  const dura = { dura: true, peso: 0 };

  return [
    { ...comun, ...dura, id: 'regla-sin-solapes', tipo: 'sinSolapes', params: {}, nombre: 'Sin solapes' },
    { ...comun, ...dura, id: 'regla-cobertura-completa', tipo: 'coberturaCompleta', params: {}, nombre: 'Cobertura completa' },
    { ...comun, ...dura, id: 'regla-persona-disponible', tipo: 'personaDisponible', params: {}, nombre: 'Persona disponible' },
    { ...comun, ...dura, id: 'regla-habilitacion', tipo: 'habilitacionRequerida', params: {}, nombre: 'Habilitación requerida' },
    {
      ...comun, ...dura, id: 'regla-max-horas-dia', tipo: 'maxMinutosDia',
      params: { maxMin: 270, excepciones: [{ areaId: pedidos, maxMin: null }] },
      nombre: 'Máximo 4h30 al día',
    },
    { ...comun, ...dura, id: 'regla-no-repetir-lego', tipo: 'noRepetirConsecutivas', params: { ambito: ambito(lego) }, nombre: 'No repetir seguidas en LEGO' },
    { ...comun, ...dura, id: 'regla-bloque-caja', tipo: 'mismaPersonaBloque', params: { ambito: ambito(caja) }, nombre: 'Mismo bloque en Caja' },
    { ...comun, dura: false, peso: 5, id: 'regla-rotar-caja', tipo: 'rotarEntreBloques', params: { ambito: ambito(caja) }, nombre: 'Rotar entre bloques de Caja' },
    {
      ...comun, ...dura, id: 'regla-exclusividad-pedidos', tipo: 'exclusividadDiaria',
      params: { puestoIds: [IDS_EJEMPLO.puestos.pedidos], diasExcepcion: [6] },
      nombre: 'Pedidos en exclusiva',
    },
    {
      ...comun, ...dura, id: 'regla-respetar-equipo', tipo: 'respetarEquipo',
      params: { maxDiasContrarioSemana: 1, diasPermitidos: [6] },
      nombre: 'Respetar equipo',
    },
    { ...comun, ...dura, id: 'regla-max-dias', tipo: 'maxDiasSemana', params: { max: 6 }, nombre: 'Máximo 6 días' },
    { ...comun, dura: false, peso: 10, id: 'regla-lego-una-franja', tipo: 'maxFranjasSiSoloArea', params: { areaId: lego, maxFranjas: 1 }, nombre: 'Una sola franja si solo LEGO' },
    {
      ...comun, ...dura, id: 'regla-comidas-domingo', tipo: 'comidasEscalonadas',
      params: {
        dias: [6],
        umbralJornadaMin: 480,
        duracionMin: 60,
        franjas: [
          { inicio: aMinutos('14:00'), fin: aMinutos('15:00'), maxPersonas: 4 },
          { inicio: aMinutos('15:00'), fin: aMinutos('16:00'), maxPersonas: 4 },
          { inicio: aMinutos('16:00'), fin: aMinutos('17:00'), maxPersonas: 3 },
        ],
      },
      nombre: 'Comidas escalonadas del domingo',
    },
    { ...comun, ...dura, activa: false, id: 'regla-descanso', tipo: 'descansoEntreJornadas', params: { minMin: 720 }, nombre: 'Descanso de 12 horas' },
    { ...comun, dura: false, peso: 1, id: 'regla-reparto-equitativo', tipo: 'repartoEquitativo', params: {}, nombre: 'Reparto equitativo' },
  ];
}

export function crearEstadoEjemplo(): EstadoApp {
  return {
    config: { corteMananaTarde: aMinutos('15:45'), exportacionArea: 'diasEnColumnas', semilla: 1, limiteMotorMs: 3000 },
    areas: crearAreas(),
    puestos: crearPuestos(),
    personas: crearPersonas(),
    reglas: crearReglas(),
    rotacion: { longitudCiclo: 2, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B'] },
    semanasTipo: [],
    incidencias: [],
    cuadrantes: {},
  };
}

export function crearEstadoVacio(): EstadoApp {
  return {
    config: { corteMananaTarde: aMinutos('15:45'), exportacionArea: 'diasEnColumnas', semilla: 1, limiteMotorMs: 3000 },
    areas: [],
    puestos: [],
    personas: [],
    reglas: [],
    rotacion: { longitudCiclo: 1, lunesReferencia: '2026-11-23', etiquetas: ['A'] },
    semanasTipo: [],
    incidencias: [],
    cuadrantes: {},
  };
}
