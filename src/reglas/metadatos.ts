/**
 * Metadatos de los tipos de regla (fase 2): la parte de cada definición que no evalúa.
 * Cada archivo src/reglas/general/<tipo>.ts y src/reglas/persona/<tipo>.ts exporta
 * `metadatos`; en la fase 3 el mismo archivo añadirá `definicion = { ...metadatos, tipo, evaluar, comprobar }`.
 *
 * `campos` describe el formulario de parámetros para que la interfaz lo pinte de forma genérica.
 */
import type {
  DefinicionReglaGeneral,
  DefinicionRestriccion,
} from './contrato';
import type { ParamsReglaGeneral, ParamsRestriccion, TipoReglaGeneral, TipoRestriccion } from '../modelo/tipos';

/**
 * Tipos de campo de parámetro y el valor que guardan:
 *  - duracion        Minutos (se edita como horas y minutos: «4h30»)
 *  - hora            Minutos desde las 00:00 (se edita como HH:MM)
 *  - entero          number entero
 *  - dias            DiaSemana[]
 *  - ambito          Ambito (áreas y puestos; vacío = todo)
 *  - area            Id de un área
 *  - puestos         Id[] de puestos
 *  - excepcionesArea { areaId: Id; maxMin: Minutos | null }[]  (null = sin límite)
 *  - franjasComida   FranjaComida[]
 * `anulable`: el valor puede ser null (se muestra la casilla «sin límite»).
 */
export type TipoCampo =
  | 'duracion'
  | 'hora'
  | 'entero'
  | 'dias'
  | 'ambito'
  | 'area'
  | 'puestos'
  | 'excepcionesArea'
  | 'franjasComida';

export interface CampoParam<P> {
  clave: Extract<keyof P, string>;
  etiqueta: string;
  tipo: TipoCampo;
  ayuda?: string;
  anulable?: boolean;
  /** Límites para entero y duracion (en minutos). */
  min?: number;
  max?: number;
}

export type MetadatosReglaGeneral<T extends TipoReglaGeneral> = Omit<
  DefinicionReglaGeneral<T>,
  'evaluar' | 'comprobar'
> & { campos: CampoParam<ParamsReglaGeneral[T]>[] };

export type MetadatosRestriccion<T extends TipoRestriccion> = Omit<
  DefinicionRestriccion<T>,
  'evaluar' | 'comprobar'
> & { campos: CampoParam<ParamsRestriccion[T]>[] };

export type CatalogoMetadatosGeneral = { [T in TipoReglaGeneral]: MetadatosReglaGeneral<T> };
export type CatalogoMetadatosRestricciones = { [T in TipoRestriccion]: MetadatosRestriccion<T> };
