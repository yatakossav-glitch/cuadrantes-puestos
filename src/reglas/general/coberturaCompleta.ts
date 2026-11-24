import type { ReglaGeneral } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionReglaGeneral, IndiceSemana, Incumplimiento } from '../contrato';
import type { AsignacionPuesto, ClaveHueco, Hueco } from '../../modelo/tipos';
import { enumerar, nombrePuesto } from '../texto';
import { cuando, etiquetaPersona, incumplimientoGeneral, penalizacion } from '../util';
import type { MetadatosReglaGeneral } from '../metadatos';

export const metadatos: MetadatosReglaGeneral<'coberturaCompleta'> = {
  tipo: 'coberturaCompleta',
  nombre: 'Cobertura completa',
  ayuda: 'Todos los huecos de los puestos activos deben tener a alguien.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({}),
  describir: () => 'Todos los huecos de los puestos activos deben estar cubiertos',
  validarParams: () => [],
  campos: [],
};

function claveDeHueco(h: Hueco): ClaveHueco {
  return `${h.fecha}|${h.puestoId}|${h.franjaId}|${h.plaza}`;
}

function sufijoPlaza(plazas: number, plaza: number): string {
  return plazas > 1 ? ` (plaza ${plaza + 1})` : '';
}

/** Motivo por el que una asignación de puesto no encaja en el horario (null si encaja). */
function motivoNoEncaja(a: AsignacionPuesto, indice: IndiceSemana): string | null {
  const puesto = indice.puesto(a.puestoId);
  if (!puesto) return 'el puesto ya no existe';
  if (!puesto.activo || indice.area(puesto.areaId)?.activa === false) return 'el puesto está inactivo';
  if (!indice.horario(a.puestoId, a.fecha)) return 'el puesto está cerrado ese día';
  if (!indice.franja(a.puestoId, a.fecha, a.franjaId)) return 'esa franja no existe ese día';
  if (a.plaza >= puesto.plazas || a.plaza < 0) return `la plaza ${a.plaza + 1} no existe`;
  return null;
}

function evaluar(regla: ReglaGeneral<'coberturaCompleta'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice, datos } = ctx;
  const resultado: Incumplimiento[] = [];

  // 1. Huecos vacíos, agrupando franjas consecutivas del mismo puesto, plaza y día.
  const vacios = new Map<string, Hueco[]>();
  for (const h of indice.huecos()) {
    if (indice.enHueco(claveDeHueco(h))) continue;
    const k = `${h.fecha}|${h.puestoId}|${h.plaza}`;
    const g = vacios.get(k);
    if (g) g.push(h);
    else vacios.set(k, [h]);
  }
  for (const grupo of vacios.values()) {
    grupo.sort((x, y) => x.inicio - y.inicio);
    let tramo: Hueco[] = [];
    const cerrar = () => {
      const primero = tramo[0];
      const ultimo = tramo[tramo.length - 1];
      if (!primero || !ultimo) return;
      const puesto = indice.puesto(primero.puestoId);
      const claves: ClaveHueco[] = tramo.map(claveDeHueco);
      resultado.push(
        incumplimientoGeneral(regla, {
          mensaje: `${nombrePuesto(primero.puestoId, datos)}${sufijoPlaza(puesto?.plazas ?? 1, primero.plaza)} sin cubrir ${cuando(primero.fecha, { inicio: primero.inicio, fin: ultimo.fin })}`,
          marca: 'hueco',
          fecha: primero.fecha,
          huecos: claves,
          unidades: tramo.length,
        }),
      );
      tramo = [];
    };
    for (const h of grupo) {
      const previo = tramo[tramo.length - 1];
      if (previo && previo.fin !== h.inicio) cerrar();
      tramo.push(h);
    }
    cerrar();
  }

  // 2. Asignaciones que no encajan en el horario.
  const porClave = new Map<ClaveHueco, AsignacionPuesto[]>();
  for (const a of indice.asignaciones()) {
    if (a.tipo !== 'puesto') continue;
    const puesto = indice.puesto(a.puestoId);
    const persona = etiquetaPersona(indice.persona(a.personaId));
    const donde = puesto ? nombrePuesto(a.puestoId, datos) : 'un puesto que ya no existe';
    const motivo = motivoNoEncaja(a, indice);
    if (motivo) {
      const iv = indice.intervalo(a);
      resultado.push(
        incumplimientoGeneral(regla, {
          mensaje: `La asignación de ${persona} en ${donde} ${cuando(a.fecha, iv)} no encaja en el horario: ${motivo}`,
          marca: 'aviso',
          fecha: a.fecha,
          personaId: a.personaId,
          asignacionIds: [a.id],
        }),
      );
      continue;
    }
    const k = indice.claveDe(a);
    const g = porClave.get(k);
    if (g) g.push(a);
    else porClave.set(k, [a]);
  }

  // 3. Dos asignaciones en la misma plaza.
  for (const [clave, lista] of porClave) {
    if (lista.length < 2) continue;
    const primera = lista[0];
    if (!primera) continue;
    const puesto = indice.puesto(primera.puestoId);
    const personas = enumerar(lista.map((a) => etiquetaPersona(indice.persona(a.personaId))));
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `Hay ${lista.length} asignaciones en ${nombrePuesto(primera.puestoId, datos)}${sufijoPlaza(puesto?.plazas ?? 1, primera.plaza)} ${cuando(primera.fecha, indice.intervalo(primera))} (${personas})`,
        marca: 'aviso',
        fecha: primera.fecha,
        asignacionIds: lista.map((a) => a.id),
        huecos: [clave],
      }),
    );
  }
  return resultado;
}

export const definicion: DefinicionReglaGeneral<'coberturaCompleta'> = {
  ...metadatos,
  evaluar,
  comprobar(regla, ctx, candidata) {
    // Cubrir un hueco nunca cuesta: solo cuentan los avisos (no encaja o plaza ya ocupada).
    const { indice, datos } = ctx;
    const libre = { permitido: true, coste: 0, motivos: [] };
    if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return libre;
    const donde = nombrePuesto(candidata.puestoId, datos);
    const quien = etiquetaPersona(indice.persona(candidata.personaId));
    const motivo = motivoNoEncaja(candidata, indice);
    let aviso: string;
    let coste: number;
    if (motivo) {
      aviso = `La asignación de ${quien} en ${donde} ${cuando(candidata.fecha, indice.intervalo(candidata))} no encaja en el horario: ${motivo}`;
      coste = penalizacion(regla.dura, regla.peso, 1);
    } else if (indice.enHueco(indice.claveDe(candidata))) {
      aviso = `Ya hay alguien en ${donde} ${cuando(candidata.fecha, indice.intervalo(candidata))}`;
      // Un único incumplimiento por plaza: solo cuesta al pasar de 1 a 2 asignaciones.
      const clave = indice.claveDe(candidata);
      const previas = regla.dura ? 1 : indice.asignaciones().filter((a) => a.tipo === 'puesto' && indice.claveDe(a) === clave).length;
      coste = previas >= 2 ? 0 : penalizacion(regla.dura, regla.peso, 1);
    } else return libre;
    return { permitido: !regla.dura, coste, motivos: [aviso] };
  },
};
