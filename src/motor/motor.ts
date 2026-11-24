/**
 * Motor de asignación (§4, ARQUITECTURA §5 y §11.1).
 * Orden de pasadas: preparación → construcción → mejora → comidas → reparación de comidas.
 * Función pura y determinista: misma petición ⇒ mismas asignaciones (salvo `cortadoPorTiempo`).
 */
import { CATALOGO } from '../reglas/catalogo';
import { crearIndice } from '../validacion/indice';
import { validarSemana, type Catalogos } from '../validacion/validador';
import { fechasSemana } from '../modelo/fechas';
import type { Asignacion, DatosPlanificacion, FechaISO, Hueco, Id } from '../modelo/tipos';
import { mulberry32 } from './azar';
import { construir, cubrirVacias, personasActivas } from './construccion';
import { colocarComidas, repararComidas, repararPausasMinimas } from './comidas';
import type { Candidato, Motor, PeticionMotor, ProgresoMotor, ResultadoMotor, ExplicacionHueco } from './contrato';
import { explicarUnidad } from './explicaciones';
import { mejorar } from './mejora';
import { preparar } from './preparacion';
import { asignacionesDeUnidad, claveDeHueco, crearComprobador, idUnico, unidadDeHueco } from './unidades';

export const MAX_ITERACIONES_POR_DEFECTO = 800;

export interface OpcionesMotor {
  /** Reloj en milisegundos (inyectable en los tests). Por defecto `performance.now`. */
  reloj?: () => number;
}

function relojPorDefecto(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function crearMotor(catalogos: Catalogos, opciones: OpcionesMotor = {}): Motor {
  const reloj = opciones.reloj ?? relojPorDefecto;

  function generar(peticion: PeticionMotor, alProgresar?: (p: ProgresoMotor) => void): ResultadoMotor {
    const inicio = reloj();
    const { datos, lunes } = peticion;
    const avisar = (fase: ProgresoMotor['fase'], fraccion: number, huecos: number, blanda: number): void =>
      alProgresar?.({ fase, fraccion, huecosSinCubrir: huecos, penalizacionBlanda: blanda });

    avisar('preparacion', 0, 0, 0);
    const preparacion = preparar(peticion, catalogos);
    const { unidades, fijas } = preparacion;
    const comprobador = crearComprobador(datos, catalogos);
    const azar = mulberry32(peticion.semilla);
    const totalHuecos = unidades.reduce((n, u) => n + u.huecos.length, 0);

    avisar('construccion', 0, totalHuecos, 0);
    const construccion = construir(
      datos,
      comprobador,
      preparacion,
      azar,
      (f, sinCubrir) => avisar('construccion', f, sinCubrir, 0),
      { reloj, inicio, limiteMs: peticion.limiteMs },
    );

    avisar('mejora', 0, 0, 0);
    const mejora = mejorar({
      datos,
      catalogos,
      comprobador,
      lunes,
      fijas,
      unidades,
      personas: construccion.personas,
      azar,
      maxIteraciones: Math.max(0, Math.floor(peticion.maxIteraciones)),
      limiteMs: peticion.limiteMs,
      reloj,
      inicio,
      alProgresar: (it, huecos, blanda) =>
        avisar('mejora', it / Math.max(1, peticion.maxIteraciones), huecos, blanda),
    });

    avisar('comidas', 0, 0, 0);
    const puestos = (ps: readonly (Id | null)[]): Asignacion[] => {
      const lista: Asignacion[] = [];
      unidades.forEach((u, i) => {
        const p = ps[i];
        if (p != null) lista.push(...asignacionesDeUnidad(u, p));
      });
      return lista;
    };
    const comidas = colocarComidas(datos, comprobador, lunes, [...fijas, ...puestos(mejora.personas)]);
    const reparacion = repararComidas({
      datos,
      comprobador,
      lunes,
      fijas,
      unidades,
      personas: mejora.personas,
      comidas,
      reloj,
      inicio,
      limiteMs: peticion.limiteMs,
    });

    // Pasada final: cubrir lo que siga vacío (mejor candidata o expulsión) y rehacer las comidas si algo cambió.
    let personas = reparacion.personas;
    let comidasFinal = reparacion.comidas;
    const rellenadas = cubrirVacias(datos, comprobador, lunes, fijas, unidades, personas);
    if (rellenadas.some((p, i) => p !== personas[i])) {
      personas = rellenadas;
      comidasFinal = colocarComidas(datos, comprobador, lunes, [...fijas, ...puestos(personas)]);
    }
    const pausaMinima = repararPausasMinimas({
      datos,
      catalogos,
      comprobador,
      lunes,
      fijas,
      unidades,
      personas,
      comidas: comidasFinal,
      reloj,
      inicio,
      limiteMs: peticion.limiteMs,
    });
    personas = pausaMinima.personas;
    comidasFinal = pausaMinima.comidas;

    const nuevasPuesto = puestos(personas).sort(compararAsignaciones(datos));
    const nuevasPausa = [...comidasFinal.pausas].sort((a, b) =>
      a.fecha === b.fecha ? a.inicio - b.inicio || (a.personaId < b.personaId ? -1 : 1) : a.fecha < b.fecha ? -1 : 1,
    );
    // Ids únicos: si el determinista ya existe (p. ej. por una generación anterior), sufijo -2, -3…
    const usados = new Set<Id>(fijas.map((a) => a.id));
    const unicas = (lista: Asignacion[]): Asignacion[] =>
      lista.map((a) => {
        const id = idUnico(a.id, usados);
        usados.add(id);
        return id === a.id ? a : { ...a, id };
      });
    const asignaciones: Asignacion[] = [...fijas, ...unicas(nuevasPuesto), ...unicas(nuevasPausa)];

    const indiceFinal = crearIndice(datos, lunes, asignaciones);
    const activas = personasActivas(datos);
    const sinCubrir: ExplicacionHueco[] = [];
    unidades.forEach((u, i) => {
      if (personas[i] == null) sinCubrir.push(...explicarUnidad(datos, comprobador, indiceFinal, u, activas));
    });

    const validacion = validarSemana(datos, lunes, asignaciones, catalogos);
    avisar('comidas', 1, sinCubrir.length, validacion.penalizacionBlanda);

    return {
      asignaciones,
      sinCubrir,
      comidasPendientes: comidasFinal.pendientes,
      penalizacionBlanda: validacion.penalizacionBlanda,
      iteraciones: mejora.iteraciones,
      ms: reloj() - inicio,
      cortadoPorTiempo:
        construccion.cortadoPorTiempo || mejora.cortadoPorTiempo || reparacion.cortadoPorTiempo || pausaMinima.cortadoPorTiempo,
    };
  }

  function sugerir(datos: DatosPlanificacion, lunes: FechaISO, actuales: Asignacion[], hueco: Hueco): Candidato[] {
    if (!fechasSemana(lunes).includes(hueco.fecha)) return [];
    const indice0 = crearIndice(datos, lunes, actuales);
    const unidad = unidadDeHueco(datos, indice0, hueco);
    if (!unidad) return [];
    // Se evalúa como si la unidad estuviera vacía: lo que ya hay en sus huecos se va a sustituir.
    const claves = new Set(unidad.huecos.map(claveDeHueco));
    const resto = actuales.filter((a) => !(a.tipo === 'puesto' && claves.has(indice0.claveDe(a))));
    const indice = crearIndice(datos, lunes, resto);
    const comprobador = crearComprobador(datos, catalogos);

    const todos = personasActivas(datos).map((p) => {
      const r = comprobador.unidad(indice, unidad, p.id, { completo: true });
      const candidato: Candidato = { personaId: p.id, permitido: r.permitido, coste: r.coste, motivos: r.motivos };
      return { candidato, codigo: p.codigo };
    });
    const porCodigo = (a: { codigo: string }, b: { codigo: string }): number =>
      a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0;
    const permitidos = todos.filter((x) => x.candidato.permitido).sort((a, b) => a.candidato.coste - b.candidato.coste || porCodigo(a, b));
    const noPermitidos = todos.filter((x) => !x.candidato.permitido).sort(porCodigo);
    return [...permitidos, ...noPermitidos].map((x) => x.candidato);
  }

  return { generar, sugerir };
}

/** Orden de salida de las asignaciones nuevas: fecha, hora, orden del puesto y plaza. */
function compararAsignaciones(datos: DatosPlanificacion): (a: Asignacion, b: Asignacion) => number {
  const orden = new Map<Id, number>(datos.puestos.map((p) => [p.id, p.orden]));
  const inicioDe = new Map<string, number>();
  for (const p of datos.puestos) {
    for (const h of [p.horario.general, ...Object.values(p.horario.porDia)]) {
      for (const f of h.franjas) inicioDe.set(`${p.id}|${f.id}`, f.inicio);
    }
  }
  return (a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    if (a.tipo !== 'puesto' || b.tipo !== 'puesto') return 0;
    const ia = inicioDe.get(`${a.puestoId}|${a.franjaId}`) ?? 0;
    const ib = inicioDe.get(`${b.puestoId}|${b.franjaId}`) ?? 0;
    if (ia !== ib) return ia - ib;
    const oa = orden.get(a.puestoId) ?? 0;
    const ob = orden.get(b.puestoId) ?? 0;
    if (oa !== ob) return oa - ob;
    return a.plaza - b.plaza;
  };
}

export const motor: Motor = crearMotor(CATALOGO);
