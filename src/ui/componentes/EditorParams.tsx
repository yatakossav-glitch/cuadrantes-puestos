/** Formulario genérico de parámetros de una regla, a partir de sus `campos` (src/reglas/metadatos.ts). */
import type { DatosPlanificacion, DiaSemana, FranjaComida, Id, Minutos } from '../../modelo/tipos';
import type { CampoParam } from '../../reglas/metadatos';
import { CampoDuracion, CampoHora, CampoNumero, Interruptor, ListaMarcable, SelectorAmbito, SelectorDias, usarValidezAgregada } from './campos';
import type { OpcionMarcable } from './campos';

interface ExcepcionArea {
  areaId: Id;
  maxMin: Minutos | null;
}

export interface PropsEditorParams<P extends object> {
  campos: ReadonlyArray<CampoParam<P>>;
  valor: P;
  onCambio: (nuevo: P) => void;
  datos: DatosPlanificacion;
  idBase: string;
  /** false si algún campo de hora o duración tiene un texto que no se entiende. */
  onValidez?: (valido: boolean) => void;
}

const esRegistro = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const numero = (x: unknown, defecto: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : defecto);
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

function leerExcepciones(x: unknown): ExcepcionArea[] {
  return lista(x)
    .filter(esRegistro)
    .map((e) => ({ areaId: typeof e.areaId === 'string' ? e.areaId : '', maxMin: typeof e.maxMin === 'number' ? e.maxMin : null }));
}

function leerFranjas(x: unknown): FranjaComida[] {
  return lista(x)
    .filter(esRegistro)
    .map((f) => ({ inicio: numero(f.inicio, 780), fin: numero(f.fin, 840), maxPersonas: numero(f.maxPersonas, 1) }));
}

function valorInicialAnulable(c: { tipo: string; min?: number; max?: number }): number {
  const base = c.tipo === 'duracion' ? 60 : c.tipo === 'hora' ? 540 : 1;
  const minimo = Math.max(c.min ?? 0, base);
  return c.max !== undefined ? Math.min(minimo, c.max) : minimo;
}

export function EditorParams<P extends object>({ campos, valor, onCambio, datos, idBase, onValidez }: PropsEditorParams<P>) {
  const validez = usarValidezAgregada(onValidez);
  const actual = valor as unknown as Record<string, unknown>;
  const poner = (clave: string, nuevo: unknown) => onCambio({ ...actual, [clave]: nuevo } as unknown as P);

  return (
    <div class="rejilla-campos">
      {campos.map((c) => {
        const clave: string = c.clave;
        const id = `${idBase}-${clave}`;
        const v = actual[clave];
        const anulado = c.anulable === true && v === null;
        const casillaSinLimite = c.anulable ? (
          <Interruptor
            id={`${id}-sinlimite`}
            etiqueta="Sin límite"
            valor={anulado}
            onCambio={(sin) => poner(clave, sin ? null : valorInicialAnulable(c))}
          />
        ) : null;

        switch (c.tipo) {
          case 'duracion':
            return (
              <div class="campo-compuesto" key={clave}>
                <CampoDuracion id={id} etiqueta={c.etiqueta} ayuda={c.ayuda} valor={numero(v, 0)} deshabilitado={anulado} onCambio={(m) => poner(clave, m)} onValidez={validez(id)} />
                {casillaSinLimite}
              </div>
            );
          case 'hora':
            return (
              <div class="campo-compuesto" key={clave}>
                <CampoHora id={id} etiqueta={c.etiqueta} ayuda={c.ayuda} valor={numero(v, 0)} deshabilitado={anulado} onCambio={(m) => poner(clave, m)} onValidez={validez(id)} />
                {casillaSinLimite}
              </div>
            );
          case 'entero':
            return (
              <div class="campo-compuesto" key={clave}>
                <CampoNumero id={id} etiqueta={c.etiqueta} ayuda={c.ayuda} valor={numero(v, c.min ?? 0)} min={c.min} max={c.max} deshabilitado={anulado} onCambio={(n) => poner(clave, n)} />
                {casillaSinLimite}
              </div>
            );
          case 'dias':
            return (
              <SelectorDias
                key={clave}
                id={id}
                leyenda={c.etiqueta}
                ayuda={c.ayuda}
                valor={lista(v).filter((d): d is DiaSemana => typeof d === 'number' && d >= 0 && d <= 6)}
                onCambio={(dias) => poner(clave, dias)}
              />
            );
          case 'ambito': {
            const a = esRegistro(v) ? v : {};
            const ids = (x: unknown) => lista(x).filter((s): s is string => typeof s === 'string');
            return (
              <SelectorAmbito
                key={clave}
                id={id}
                leyenda={c.etiqueta}
                valor={{ areaIds: ids(a.areaIds), puestoIds: ids(a.puestoIds) }}
                areas={datos.areas}
                puestos={datos.puestos}
                onCambio={(n) => poner(clave, n)}
              />
            );
          }
          case 'area':
            return (
              <div class="campo" key={clave}>
                <label for={id}>{c.etiqueta}</label>
                <select id={id} value={typeof v === 'string' ? v : ''} onChange={(e) => poner(clave, e.currentTarget.value)}>
                  {(typeof v !== 'string' || !datos.areas.some((a) => a.id === v)) && <option value="">Elige un área</option>}
                  {datos.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
                {c.ayuda && <small class="ayuda">{c.ayuda}</small>}
              </div>
            );
          case 'puestos': {
            const opciones: OpcionMarcable[] = datos.areas.flatMap((a) =>
              datos.puestos.filter((p) => p.areaId === a.id).map((p) => ({ valor: p.id, etiqueta: p.nombre, grupo: a.nombre })),
            );
            return (
              <ListaMarcable
                key={clave}
                id={id}
                leyenda={c.etiqueta}
                opciones={opciones}
                valor={lista(v).filter((s): s is string => typeof s === 'string')}
                onCambio={(n) => poner(clave, n)}
              />
            );
          }
          case 'excepcionesArea': {
            const filas = leerExcepciones(v);
            const cambiar = (i: number, f: ExcepcionArea) => poner(clave, filas.map((x, j) => (j === i ? f : x)));
            const libre = datos.areas.find((a) => !filas.some((f) => f.areaId === a.id));
            return (
              <fieldset class="grupo" key={clave}>
                <legend>{c.etiqueta}</legend>
                {c.ayuda && <p class="ayuda">{c.ayuda}</p>}
                {filas.length === 0 && <p class="ayuda">No hay excepciones.</p>}
                <ul class="lista-ficha">
                  {filas.map((f, i) => (
                    <li class="fila-edicion" key={i}>
                      <div class="campo">
                        <label for={`${id}-${i}-area`}>Área</label>
                        <select id={`${id}-${i}-area`} value={f.areaId} onChange={(e) => cambiar(i, { ...f, areaId: e.currentTarget.value })}>
                          {!datos.areas.some((a) => a.id === f.areaId) && <option value="">Elige un área</option>}
                          {datos.areas.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                      <CampoDuracion
                        id={`${id}-${i}-max`}
                        etiqueta="Máximo"
                        valor={f.maxMin ?? 240}
                        deshabilitado={f.maxMin === null}
                        onCambio={(m) => cambiar(i, { ...f, maxMin: m })}
                        onValidez={validez(`${id}-${i}-max`)}
                      />
                      <Interruptor
                        id={`${id}-${i}-sin`}
                        etiqueta="Sin límite"
                        valor={f.maxMin === null}
                        onCambio={(sin) => cambiar(i, { ...f, maxMin: sin ? null : 240 })}
                      />
                      <button type="button" class="boton" onClick={() => poner(clave, filas.filter((_, j) => j !== i))}>
                        Quitar excepción {i + 1}
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  class="boton"
                  disabled={!libre}
                  onClick={() => libre && poner(clave, [...filas, { areaId: libre.id, maxMin: null }])}
                >
                  Añadir excepción
                </button>
              </fieldset>
            );
          }
          case 'franjasComida': {
            const filas = leerFranjas(v);
            const cambiar = (i: number, f: FranjaComida) => poner(clave, filas.map((x, j) => (j === i ? f : x)));
            const ultima = filas[filas.length - 1];
            const inicioNueva = ultima ? ultima.fin : 780;
            return (
              <fieldset class="grupo" key={clave}>
                <legend>{c.etiqueta}</legend>
                {c.ayuda && <p class="ayuda">{c.ayuda}</p>}
                {filas.length === 0 && <p class="ayuda">No hay franjas.</p>}
                <ul class="lista-ficha">
                  {filas.map((f, i) => (
                    <li class="fila-edicion" key={i}>
                      <CampoHora id={`${id}-${i}-inicio`} etiqueta="Inicio" valor={f.inicio} onCambio={(m) => cambiar(i, { ...f, inicio: m })} onValidez={validez(`${id}-${i}-inicio`)} />
                      <CampoHora id={`${id}-${i}-fin`} etiqueta="Fin" valor={f.fin} onCambio={(m) => cambiar(i, { ...f, fin: m })} onValidez={validez(`${id}-${i}-fin`)} />
                      <CampoNumero
                        id={`${id}-${i}-max`}
                        etiqueta="Máx. personas"
                        valor={f.maxPersonas}
                        min={1}
                        onCambio={(n) => cambiar(i, { ...f, maxPersonas: n })}
                      />
                      <button type="button" class="boton" onClick={() => poner(clave, filas.filter((_, j) => j !== i))}>
                        Quitar franja {i + 1}
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  class="boton"
                  onClick={() => poner(clave, [...filas, { inicio: inicioNueva, fin: Math.min(inicioNueva + 60, 1440), maxPersonas: 1 }])}
                >
                  Añadir franja
                </button>
              </fieldset>
            );
          }
        }
      })}
    </div>
  );
}
