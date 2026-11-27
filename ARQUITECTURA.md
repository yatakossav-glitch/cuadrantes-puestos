# Arquitectura · App de cuadrantes de puestos

Especificación de origen: [docs/20261123_prompt_app-cuadrantes.md](docs/20261123_prompt_app-cuadrantes.md) (citada como §n).
Contratos (no se tocan sin permiso del director): `src/modelo/tipos.ts`, `src/modelo/esquema.ts`, `src/reglas/contrato.ts`, `src/motor/contrato.ts`.

## 1. Decisiones tomadas

| # | Decisión | Motivo |
|---|----------|--------|
| D1 | TypeScript estricto + Vite + `vite-plugin-singlefile` + Vitest, como sugiere §2. | Un único `index.html` autocontenido. |
| D2 | Interfaz con **Preact** (≈4 KB, sin CDN: se integra en el HTML). | Rejilla, arrastrar y soltar y deshacer necesitan componentes y estado; el DOM a mano sería frágil. |
| D3 | Horas en **minutos desde las 00:00**; intervalos **[inicio, fin)**. | Aritmética exacta; franjas que se tocan no se solapan. |
| D4 | Fechas ISO `AAAA-MM-DD` en hora local; días 0 = lunes … 6 = domingo. | Sin problemas de zona horaria ni de cambio de hora. |
| D5 | Reglas generales y restricciones personales son **datos** (tipo + parámetros + dureza + estado). Cada tipo, un archivo; el catálogo tipado obliga a implementar todos. | §3.3; permite paralelizar la construcción. |
| D6 | Las comprobaciones que ya hace su Excel (huecos vacíos, personas de baja, habilitación) también son **tipos de regla** (`coberturaCompleta`, `personaDisponible`, `habilitacionRequerida`). | Un solo validador y un solo semáforo; se pueden ver y ajustar como el resto. |
| D7 | Las **ausencias** son `Incidencia` (con fechas), no restricción. No guardan categoría (vacaciones, baja…), solo fechas y una nota sin datos personales. | §3.2 la trata como incidencia; §2 prohíbe guardar el motivo. |
| D8 | Si una franja es de mañana o de tarde se decide por la **hora de inicio** respecto a `corteMananaTarde`. | Duda 5, valor propuesto. Configurable. |
| D9 | «Jornada» = inicio del primer puesto → fin del último puesto **del cuadrante** ese día. | Duda 3; es lo único que la app conoce. |
| D10 | **Determinismo** por presupuesto de iteraciones (`maxIteraciones`) y PRNG con semilla (mulberry32). El límite de tiempo es solo una salvaguarda y, si salta, se avisa. | Con límite solo de tiempo, el resultado dependería de la velocidad del ordenador. |
| D11 | El motor corre en un **Web Worker en línea** (blob, `?worker&inline`), con alternativa en el hilo principal si el navegador lo bloquea. | La interfaz no se congela durante ~3 s y no hay peticiones de red. |
| D12 | Copias de seguridad: `PREFIJO + base64(gzip(JSON))` con `CompressionStream`, nativo en Edge y Chrome. | §2 sin dependencias. |
| D13 | «Copiar para Excel» mediante el evento `copy` (`clipboardData.setData` con `text/html` y `text/plain`) lanzado con `execCommand('copy')`; `navigator.clipboard.write` como primera opción si hay contexto seguro. | Funciona también en `file://` y en entornos corporativos restringidos. |
| D14 | Deshacer y rehacer con instantáneas inmutables del `EstadoApp` (50 pasos). | §6 pide al menos 20; con datos de este tamaño las instantáneas son baratas. |
| D15 | CSP en el HTML final: `connect-src 'none'`, sin fuentes ni recursos externos (inyectada solo en el build). | Defensa extra a la regla «sin peticiones de red». |
| D16 | Iconos: trazados SVG propios de línea, al estilo Lucide, en `src/ui/iconos.tsx`; sin dependencia. | Duda 9. |
| D17 | Alias en el propio objeto `Persona`; la exportación «sin alias» los pone a `null`. | Simplicidad; los datos no salen del navegador. |

## 2. Módulos

```
src/
  modelo/        tipos.ts, esquema.ts (CONTRATOS) · fechas.ts, horas.ts, ids.ts (utilidades puras)
  datos-ejemplo/ ejemplo.ts: planta 3 ficticia, EMP-01…29, reglas en estado «pendiente»
  persistencia/  almacen.ts (localStorage + try/catch), respaldo.ts (exportar/importar), migraciones.ts
  reglas/        contrato.ts (CONTRATO) · catalogo.ts · general/<tipo>.ts · persona/<tipo>.ts · util.ts
  validacion/    indice.ts (IndiceSemana) · validador.ts (ResultadoValidacion, semáforo) · resumen.ts (contadores)
  motor/         contrato.ts (CONTRATO) · azar.ts · unidades.ts · construccion.ts · comidas.ts · mejora.ts
                 explicaciones.ts · motor.ts · trabajador.ts (Web Worker)
  rotacion/      ciclo.ts (fecha → semana del ciclo), semanaTipo.ts (aplicar semana tipo a una fecha)
  exportar/      excel.ts (HTML + TSV por área, persona y plano), portapapeles.ts
  ui/            estado.ts (store + deshacer) · iconos.tsx · componentes/ · secciones/ (7 secciones de §6) · estilos.css
  main.tsx
tests/           tests de caja negra del probador (no mira src/)
```

Las funciones de `modelo`, `reglas`, `validacion`, `motor`, `rotacion` y `exportar` son **puras** (sin DOM ni almacenamiento) y se prueban con Vitest en Node. Solo `persistencia`, `exportar/portapapeles.ts` y `ui` tocan el navegador.

## 3. Flujo de datos

```
localStorage ──cargar+migrar──▶ EstadoApp ──▶ store (ui/estado.ts, historial deshacer)
                                    │
           ┌────────────────────────┼─────────────────────────┐
           ▼                        ▼                         ▼
  IndiceSemana(semana)      Motor (Worker)              Exportar / Respaldo
           │                 PeticionMotor ─▶ ResultadoMotor ─▶ store
           ▼
  Validador ─▶ ResultadoValidacion ─▶ semáforo, lista de incidencias, marcas de celda, contadores
```

Toda edición pasa por una **acción** del store, que genera un estado nuevo, lo apila en el historial, lo guarda (con aviso si falla) y recalcula la validación de la semana visible.

## 4. Validación

1. `crearIndice(datos, lunes, asignaciones)` construye el `IndiceSemana`.
2. Para cada `ReglaGeneral` activa y no descartada → `catalogo.general[tipo].evaluar(regla, ctx)`.
3. Para cada persona y restricción activa → `catalogo.restricciones[tipo].evaluar(r, persona, ctx)`.
4. Las reglas en estado `pendiente` se evalúan igual (son la configuración inicial), pero la UI las marca como «pendiente de validar».
5. Semáforo: rojo si hay algún incumplimiento duro; ámbar si solo hay blandos; verde si no hay ninguno.
6. Los avisos de horas por persona (`minutosSemana`, `maxMinutosDia` personal) solo existen si la usuaria los ha rellenado (§10.1).

Unidades de penalización blanda (multiplicadas por el peso): **por cada 15 min** de exceso o defecto en reglas de horas; **por ocurrencia** en el resto.

## 5. Motor (§4)

### 5.1 Unidades de asignación

Una **unidad** es lo que se asigna de una vez a una persona:
- un **bloque** (todas sus franjas, una plaza, un día), si la regla `mismaPersonaBloque` está activa para ese puesto;
- si no, una **franja suelta** (una plaza, un día).

Pedidos (una franja de mañana 10:00–15:45 y otra de tarde 15:45–22:00) son unidades de una franja larga.

### 5.2 Preparación según el modo

```
fijas  ← asignaciones con candado (bloqueada = true)
segun modo:
  desdeCero:       libres ← todas las unidades no cubiertas por fijas
  completarHuecos: fijas ← fijas ∪ actuales;  libres ← unidades vacías
  semanaTipo:      base ← semanaTipo(índiceCiclo(lunes)) llevada a fechas (origen 'semanaTipo'),
                   y si ya hay actuales, se parte de las actuales
                   para cada asignación a de base (no bloqueada):
                       si a incumple alguna regla DURA en el contexto de la semana
                          (ausencia, baja, puesto cerrado, inhabilitada…) → se descarta
                       si no → fijas ← fijas ∪ {a}
                   libres ← unidades vacías tras lo anterior      # solo se recubren los huecos afectados
```

En `semanaTipo` y `completarHuecos`, la búsqueda local solo mueve asignaciones nuevas (nunca las fijas).

### 5.3 Construcción voraz (más restrictivo primero)

```
rng ← mulberry32(semilla)
cola ← libres ordenadas por la clave:
   1. requiere habilitación y unidad larga (≥ corte, p. ej. Pedidos)
   2. bloques
   3. franjas sueltas
   desempate: fecha, inicio, puesto.orden, plaza
mientras cola no vacía:
   # MRV dinámico: dentro de la categoría más prioritaria, la unidad con menos candidatas permitidas
   u ← extraer de cola la unidad con menos candidatas (recalculado cada K = 8 extracciones)
   para cada persona p activa:
       c ← comprobar(p, u)      # todas las franjas de u; reglas generales + restricciones de p
   permitidas ← {p | c.permitido}
   si permitidas vacío:
       registrar ExplicacionHueco(u, descartes = primer motivo duro de cada p)
       continuar
   elegir p con menor (c.coste + ε·rng())   # ε pequeño solo para desempatar
   añadir asignaciones de u para p
```

`comprobar(p, u)` = suma de `comprobar` de todas las reglas activas sobre cada asignación de la unidad, aplicada en secuencia sobre una copia incremental del índice (la segunda franja de un bloque ve la primera).

### 5.4 Comidas (`comidasEscalonadas`)

```
para cada día d en params.dias:
   necesitan ← personas con jornada(p, d) > umbral
   ordenar necesitan por número de franjas de comida viables (menos primero), desempate por código
   para cada p:
       opciones ← franjas f de comida tales que:
            [f.inicio, f.inicio + duracion) ⊆ f  y no se solapa con ningún puesto de p ese día
            y ocupación(f) < f.maxPersonas
       si hay opción: asignar pausa (tipo 'pausa') en la de menor ocupación (desempate: la más temprana)
       si no: comidasPendientes ← (p, d, motivo)
```

La comida **nunca** desplaza un puesto: si no cabe, queda pendiente y la búsqueda local intenta mover puestos para liberar una ventana sin descubrir nada.

### 5.5 Mejora por búsqueda local

```
objetivo(S) = M · huecosSinCubrir(S) + M · comidasPendientes(S) + penalizaciónBlanda(S)     (M = 10⁶)
para it en 1..maxIteraciones (y mientras no se supere limiteMs):
   elegir movimiento con rng:
     a) reasignar: una unidad libre (cubierta o vacía) → otra persona permitida
     b) intercambiar: personas de dos unidades libres del mismo día
     c) expulsar: cubrir una unidad vacía con p y reubicar la unidad que p deja libre
   si el movimiento rompe alguna dura → descartar
   Δ ← objetivo(S') − objetivo(S)          # cálculo incremental por persona y día afectados
   aceptar si Δ < 0, o con probabilidad exp(−Δ/T) (recocido simulado, T decrece linealmente a 0)
   recalcular comidas de los días afectados
   avisar del progreso cada 200 iteraciones
devolver la mejor solución vista
```

### 5.6 Garantías (probadas en tests)

- Ninguna regla **dura** queda incumplida en el resultado salvo en huecos que el motor deja **vacíos** y explica.
- Las asignaciones con candado salen idénticas.
- Misma `PeticionMotor` ⇒ mismo `ResultadoMotor.asignaciones` (si `cortadoPorTiempo` = false).
- Con los datos de ejemplo y las reglas por defecto, cobertura del 100 %.

### 5.7 Sugerencias manuales

`sugerir(hueco)` usa la misma `comprobar` sobre la unidad del hueco (el bloque entero si lo tiene) y devuelve todas las personas activas: primero las permitidas por coste ascendente, después las no permitidas con su motivo.

## 6. Persistencia y copias

- `guardar(estado)`: `JSON.stringify` → `localStorage.setItem` en try/catch → `ResultadoGuardado`. Si falla, la UI muestra un aviso permanente que recomienda «Exportar datos».
- `exportar(estado, {sinAlias})` → `Respaldo` → gzip → base64 con prefijo. Texto para copiar.
- `importar(texto)`: valida el prefijo, descomprime y parsea; comprueba `formato`; migra la versión; valida la estructura (referencias huérfanas, códigos duplicados o casi duplicados: mismo código tras normalizar mayúsculas, espacios y ceros, p. ej. `emp-7` ≈ `EMP-07`) → `ResultadoImportacion` con avisos.

## 7. Interfaz (§6)

Secciones: Cuadrante (por defecto) · Personas · Puestos · Reglas · Rotación · Incidencias · Datos.
Estética sobria: tipografía del sistema, alto contraste, sin emojis, iconos SVG grises; color pastel por área siempre acompañado de icono o texto. Todo control es accesible con teclado y tiene etiqueta. Mínimo 1366×768; en móvil, solo consulta.

## 8. Fase 1 · API pública y datos de ejemplo

Utilidades ya disponibles (del director): `src/modelo/horas.ts` (`aMinutos`, `aHora`, `formatearIntervalo`, `formatearDuracion`, `duracion`, `seSolapan`, `contiene`, `intervaloValido`), `src/modelo/fechas.ts` (`sumarDias`, `diferenciaDias`, `diaSemana`, `lunesDe`, `esLunes`, `fechasSemana`, `enRango`, `esFechaISO`, `formatearFecha`, `formatearDiaFecha`, `hoyISO`, `NOMBRES_DIA`, `NOMBRES_DIA_CORTO`) y `src/modelo/ids.ts` (`nuevoId`, `crearGeneradorIds`).

### 8.1 Datos de ejemplo · `src/datos-ejemplo/ejemplo.ts`

```ts
export function crearEstadoEjemplo(): EstadoApp   // copia nueva en cada llamada
export function crearEstadoVacio(): EstadoApp     // sin áreas, puestos, personas ni reglas; config por defecto
export const IDS_EJEMPLO: { areas: {pedidos, caja, lego, libreria}, puestos: {pedidos, caja1, caja2, lego} }  // ids estables
```

Contenido (todo ficticio, reproduce §10; ids legibles y estables):
- `config`: corte 945 (15:45), `exportacionArea` 'diasEnColumnas', semilla 1, `limiteMotorMs` 3000.
- Áreas planta 3: Pedidos Web (icono `paquete`), Caja (`caja`), Exposición LEGO (`bloques`), activas. Planta 4: Librería (`libro`), **inactiva**, sin puestos (pendiente de definir).
- Puestos, todos los días (0–6), 1 plaza, `requiereHabilitacion: true`, mismo horario todos los días (`porDia` vacío):
  - **Pedidos Web**: franjas 10:00–15:45 y 15:45–22:00, sin bloques.
  - **Caja 1** y **Caja 2**: 10:00–11:30, 11:30–13:00, 13:00–14:30, 14:30–15:45, 15:45–17:20, 17:20–19:00, 19:00–20:40, 20:40–22:00. Bloques: 10:00–13:00, 13:00–15:45, 15:45–19:00, 19:00–22:00 (dos franjas cada uno).
  - **Exposición LEGO**: 10:00–10:58, 10:58–11:55, 11:55–12:53, 12:53–13:50, 13:50–14:48, 14:48–15:45, 15:45–17:00, 17:00–18:15, 18:15–19:30, 19:30–20:45, 20:45–22:00.
- 29 personas `EMP-01` … `EMP-29`, alias `null`, activas, sin alta ni baja, contrato y objetivo `null`. Habilitaciones por id de área. Perfiles: Pedidos+Caja+LEGO ×6, Caja+LEGO ×10, Pedidos+Caja ×3, Pedidos+LEGO ×2, solo Pedidos ×3, solo LEGO ×5. Equipos repartidos M/T a partes casi iguales dentro de cada perfil, con 2 personas `A`. Tres restricciones de muestra: una `diasNoDisponibles` blanda, una `soloFinesDeSemana` dura y una `noDespuesDe` 20:00 dura.
- Reglas, todas en estado **`pendiente`** y activas salvo indicación:
  sinSolapes (dura) · coberturaCompleta (dura) · personaDisponible (dura) · habilitacionRequerida (dura) ·
  maxMinutosDia 270 con excepción Pedidos `null` (dura) · noRepetirConsecutivas ámbito LEGO (dura) ·
  mismaPersonaBloque ámbito Caja (dura) · rotarEntreBloques ámbito Caja (blanda, peso 5) ·
  exclusividadDiaria [Pedidos] con excepción domingo (dura) · respetarEquipo máx. 1 día al contrario, solo domingo (dura) ·
  maxDiasSemana 6 (dura) · maxFranjasSiSoloArea LEGO 1 (blanda, peso 10) ·
  comidasEscalonadas domingo, umbral 480, 60 min, 14–15 (4), 15–16 (4), 16–17 (3) (dura) ·
  descansoEntreJornadas 720 (dura, **inactiva**: no observada) · repartoEquitativo (blanda, peso 1).
- Rotación: ciclo de 2 semanas (A, B), `lunesReferencia` '2026-11-23'. Sin semanas tipo, incidencias ni cuadrantes.

### 8.2 Persistencia · `src/persistencia/`

```ts
// almacen.ts
export interface AlmacenClaveValor { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export function obtenerAlmacenNavegador(): AlmacenClaveValor | null        // localStorage si es accesible; null si lanza
export function guardarEstado(estado: EstadoApp, almacen: AlmacenClaveValor | null, ahora?: Date): ResultadoGuardado
export type ResultadoCarga =
  | { tipo: 'vacio' }
  | { tipo: 'ok'; estado: EstadoApp; versionOrigen: number; avisos: string[] }
  | { tipo: 'error'; error: string }
export function cargarEstado(almacen: AlmacenClaveValor | null): ResultadoCarga
// migraciones.ts
export function migrar(datos: unknown, versionOrigen: number, migraciones?: readonly Migracion[]):
  { ok: true; datos: unknown } | { ok: false; error: string }   // rechaza versión > VERSION_ESQUEMA o < 1
// coherencia.ts
export function normalizarCodigo(codigo: string): string    // 'EMP-07', 'emp 7', 'EMP_007', ' Emp7 ' → 'EMP7' (solo letras y dígitos, mayúsculas, sin ceros a la izquierda)
export function validarEstructura(datos: unknown): { ok: true; estado: EstadoApp } | { ok: false; error: string }
export function comprobarCoherencia(estado: EstadoApp): string[]   // avisos legibles
// respaldo.ts
export function exportarRespaldo(estado: EstadoApp, opciones: { sinAlias: boolean }, ahora?: Date): Promise<string>
export function importarRespaldo(texto: string): Promise<ResultadoImportacion>
```

- `guardarEstado` nunca lanza: devuelve `{ ok: false, error }` con un mensaje en español (cuota llena, almacenamiento bloqueado o no disponible).
- `cargarEstado` aplica migraciones, `validarEstructura` y `comprobarCoherencia`; nunca lanza.
- `exportarRespaldo` devuelve `PREFIJO_RESPALDO + base64(gzip(JSON(Respaldo)))`. Con `sinAlias`, todos los alias salen `null` y el estado original no se modifica.
- `importarRespaldo` tolera espacios y saltos de línea en el texto pegado; nunca lanza. Errores en español: falta el prefijo, texto dañado, formato distinto, versión más moderna que la app, estructura incorrecta.
- `comprobarCoherencia` avisa de: códigos duplicados (exactos o iguales tras `normalizarCodigo`), referencias huérfanas (puesto→área, habilitación→área/puesto, bloque→franja, asignación→persona/puesto/franja, incidencia→persona/puesto, semana tipo→persona/puesto), franjas mal formadas (fin ≤ inicio) y franjas solapadas dentro del mismo puesto y horario.

### 8.3 Estado de la interfaz · `src/ui/estado.ts` (puro, probado en Node)

```ts
export interface OpcionesAlmacenApp { guardar: (e: EstadoApp) => ResultadoGuardado; maxHistorial?: number /* 50 */ }
export interface AlmacenApp {
  obtener(): EstadoApp
  suscribir(fn: () => void): () => void
  aplicar(descripcion: string, cambio: (e: EstadoApp) => EstadoApp): void  // apila en historial y guarda
  reemplazar(descripcion: string, estado: EstadoApp): void                  // importar / cargar ejemplo; también se puede deshacer
  deshacer(): void; rehacer(): void
  puedeDeshacer(): boolean; puedeRehacer(): boolean
  descripcionDeshacer(): string | null; descripcionRehacer(): string | null
  errorGuardado(): string | null   // último error de guardado, null si el último guardado fue bien
}
export function crearAlmacenApp(inicial: EstadoApp, opciones: OpcionesAlmacenApp): AlmacenApp
```
Una nueva acción tras deshacer borra el futuro (rehacer). Deshacer y rehacer también guardan.

### 8.4 Arranque · `src/arranque.ts`

`prepararArranque(almacen, crearEjemplo)` decide el estado inicial. Si los datos guardados no se pueden leer, la app arranca con el ejemplo **sin escribir nada** (la banda de error de guardado sigue visible). La primera escritura tras importar o cargar datos copia antes el texto original a `cuadrantes-puestos.ilegible`, que la sección Datos permite copiar. Al importar una copia sin alias se conservan los alias locales (`src/persistencia/alias.ts`).

## 9. Fase 2 · Editores

Nuevo módulo puro **`src/edicion/`** (sin DOM ni almacenamiento, como `modelo`). Ya existen (del director): `src/reglas/metadatos.ts` (tipos `CampoParam`, `MetadatosReglaGeneral<T>`, `MetadatosRestriccion<T>`, catálogos) y `src/reglas/texto.ts` (`enumerar`, `describirDias`, `describirAmbito`, `nombreArea`, `nombrePuesto`, `erroresAmbito`, `erroresDias`).

### 9.1 Metadatos de los tipos de regla

- `src/reglas/general/<tipo>.ts` → `export const metadatos: MetadatosReglaGeneral<'<tipo>'>` (15 tipos), con `<tipo>.test.ts` al lado.
- `src/reglas/persona/<tipo>.ts` → `export const metadatos: MetadatosRestriccion<'<tipo>'>` (10 tipos), con test.
- En la fase 3 cada archivo añadirá `export const definicion = { ...metadatos, tipo, evaluar, comprobar }`.
- Registros: `src/reglas/metadatos-general.ts` y `src/reglas/metadatos-persona.ts`:

```ts
// metadatos-general.ts
export const METADATOS_GENERAL: CatalogoMetadatosGeneral
export const TIPOS_GENERAL_ORDENADOS: TipoReglaGeneral[]          // orden del selector «Añadir regla»
export function crearReglaGeneral<T extends TipoReglaGeneral>(tipo: T, datos: DatosPlanificacion, id?: Id): ReglaGeneral<T>
export function describirRegla(regla: ReglaGeneral, datos: DatosPlanificacion): string
export function erroresRegla(regla: ReglaGeneral, datos: DatosPlanificacion): string[]   // validarParams + dureza/peso
// metadatos-persona.ts (análogo)
export const METADATOS_RESTRICCION: CatalogoMetadatosRestricciones
export const TIPOS_RESTRICCION_ORDENADOS: TipoRestriccion[]
export function crearRestriccion<T extends TipoRestriccion>(tipo: T, datos: DatosPlanificacion, id?: Id): RestriccionPersona<T>
export function describirRestriccion(r: RestriccionPersona, datos: DatosPlanificacion): string
export function erroresRestriccion(r: RestriccionPersona, datos: DatosPlanificacion): string[]
```

- `crearReglaGeneral`: `activa: true`, `estado: 'validada'` (la crea la usuaria), `nombre` = nombre del tipo, `nota: ''`, `dura` = `dureza !== 'soloBlanda'`, `peso` = `pesoPorDefecto`, `params` = `paramsPorDefecto(datos)`. Id por defecto `nuevoId('regla')`. `crearRestriccion` igual, sin `estado` ni `nombre`, id `nuevoId('restr')`.
- `erroresRegla`/`erroresRestriccion` = `validarParams` + «El peso debe ser un número entero mayor que 0» si es blanda + error si la dureza no la admite el tipo.
- `describir` en español natural y corto, con horas en formato `formatearDuracion`/`aHora`: «Máximo 4h30 al día (Pedidos Web: sin límite)», «No repetir en franjas seguidas: Exposición LEGO», «Domingo: comida de 1h para jornadas de más de 8h, entre 14:00–15:00 (máx. 4), 15:00–16:00 (máx. 4) y 16:00–17:00 (máx. 3)», «No trabaja el viernes», «No terminar después de las 20:00».
- `validarParams` en español, sin tecnicismos. Mínimos: duraciones > 0 y ≤ 24h; horas 00:00–24:00; listas de días con `erroresDias`; ámbitos con `erroresAmbito`; ids de área y puesto existentes; `minutosSemana` mín ≤ máx y al menos uno; `noAsignarA` con ámbito no vacío; `diasDisponibles` no vacío; `maxDiasSemana` 1–7; `exclusividadDiaria` con al menos un puesto; `comidasEscalonadas` con días, franjas válidas sin solaparse, `maxPersonas` ≥ 1 y duración ≤ la franja más larga; `maxMinutosDia` sin áreas repetidas en excepciones; `respetarEquipo` máx. 0–7.
- `dureza`: `repartoEquitativo` → 'soloBlanda'; todos los demás → 'ambas' (decide la usuaria). `pesoPorDefecto`: 1 en `repartoEquitativo`, 5 en el resto.
- `campos`: un `CampoParam` por propiedad de `params` (vacío si no tiene).

### 9.2 Edición · `src/edicion/` (puro)

Todas las funciones devuelven un `EstadoApp` nuevo sin mutar el de entrada. Las que crean entidades reciben un generador de ids opcional (`ids: () => Id`, por defecto `nuevoId(prefijo)`).

```ts
// tipos.ts
export interface Impacto { bloqueos: string[]; efectos: string[] }  // bloqueos: impiden la acción; efectos: lo que hará

// personas.ts
export function siguienteCodigo(estado: EstadoApp): string                  // 'EMP-30' (máximo numérico + 1, 2 cifras mín.)
export function crearPersona(estado: EstadoApp, ids?: () => Id): Persona    // código siguiente, equipo 'M', activa, resto vacío
export function anadirPersona(estado: EstadoApp, persona: Persona): EstadoApp
export function reemplazarPersona(estado: EstadoApp, persona: Persona): EstadoApp   // por id
export function duplicarPersona(estado: EstadoApp, id: Id, ids?: () => Id): EstadoApp // copia con código siguiente, alias null, restricciones con ids nuevos; se inserta justo detrás
export function erroresPersona(estado: EstadoApp, persona: Persona): string[]
export function impactoBorrarPersona(estado: EstadoApp, id: Id): Impacto
export function borrarPersona(estado: EstadoApp, id: Id): EstadoApp          // + sus asignaciones (cuadrantes y semanas tipo) e incidencias

// areas.ts
export function crearArea(estado: EstadoApp, ids?: () => Id): Area          // «Área nueva», planta de la última área (o 3), color de una paleta suave no usada, icono 'tienda', activa, orden al final
export function anadirArea / reemplazarArea(estado, area): EstadoApp
export function moverArea(estado: EstadoApp, id: Id, sentido: -1 | 1): EstadoApp   // intercambia `orden` con la vecina (orden de presentación: planta, orden)
export function erroresArea(estado: EstadoApp, area: Area): string[]
export function impactoBorrarArea(estado: EstadoApp, id: Id): Impacto        // bloqueo si tiene puestos o si una regla la exige (maxFranjasSiSoloArea.areaId)
export function borrarArea(estado: EstadoApp, id: Id): EstadoApp             // quita el id de habilitaciones, ámbitos (reglas y restricciones) y excepciones de maxMinutosDia

// puestos.ts
export function crearPuesto(estado: EstadoApp, areaId: Id, ids?: () => Id): Puesto  // «Puesto nuevo», 1 plaza, todos los días, una franja 10:00–22:00, sin habilitación, activo
export function anadirPuesto / reemplazarPuesto(estado, puesto): EstadoApp
export function duplicarPuesto(estado: EstadoApp, id: Id, ids?: () => Id): EstadoApp   // «<nombre> (copia)», mismo horario y mismos ids de franja, justo detrás
export function moverPuesto(estado: EstadoApp, id: Id, sentido: -1 | 1): EstadoApp     // dentro de su área
export function erroresPuesto(estado: EstadoApp, puesto: Puesto): string[]
export function impactoCambioPuesto(estado: EstadoApp, nuevo: Puesto): Impacto   // efectos: asignaciones que dejarán de encajar (día sin puesto, franja inexistente, plaza ≥ plazas) y se quitarán
export function aplicarCambioPuesto(estado: EstadoApp, nuevo: Puesto): EstadoApp  // reemplaza y quita esas asignaciones (cuadrantes y semanas tipo)
export function impactoBorrarPuesto(estado: EstadoApp, id: Id): Impacto
export function borrarPuesto(estado: EstadoApp, id: Id): EstadoApp   // + asignaciones, incidencias puestoCerrado; quita el id de habilitaciones, ámbitos y exclusividadDiaria.puestoIds

// horario.ts (sobre un Puesto; puro)
export function horarioDe(puesto: Puesto, dia: DiaSemana): HorarioDia        // porDia[dia] ?? general
export function nuevoIdFranja(puesto: Puesto): Id                           // 'f-<n>' único en todos los horarios del puesto
export function anadirFranja(puesto: Puesto, dia: DiaSemana | 'general', intervalo: Intervalo): Puesto   // ordena por inicio
export function actualizarFranja(puesto, dia | 'general', franjaId, intervalo): Puesto
export function borrarFranja(puesto, dia | 'general', franjaId): Puesto      // la quita de su bloque; un bloque con < 2 franjas desaparece
export function crearBloque(puesto, dia | 'general', franjaIds: Id[], nombre?: string): Puesto   // nombre por defecto «HH:MM–HH:MM»; error si no son consecutivas (lanza Error con mensaje en español; la UI lo comprueba antes con `puedenFormarBloque`)
export function puedenFormarBloque(horario: HorarioDia, franjaIds: Id[]): string | null   // null = sí; si no, el motivo
export function deshacerBloque(puesto, dia | 'general', bloqueId): Puesto
export function personalizarDia(puesto: Puesto, dia: DiaSemana): Puesto     // copia el general a porDia[dia] con ids de franja y bloque nuevos
export function quitarPersonalizacion(puesto: Puesto, dia: DiaSemana): Puesto
export function erroresHorario(horario: HorarioDia, etiqueta: string): string[]   // franjas fin ≤ inicio o fuera de 00:00–24:00, solapes, bloques no consecutivos, franja en dos bloques, bloque con < 2 franjas, sin franjas

// reglas.ts
export function anadirRegla / reemplazarRegla(estado, regla: ReglaGeneral): EstadoApp
export function borrarRegla(estado: EstadoApp, id: Id): EstadoApp
export function duplicarRegla(estado: EstadoApp, id: Id, ids?: () => Id): EstadoApp    // «<nombre> (copia)», estado 'validada', justo detrás
export function cambiarEstadoRegla(estado: EstadoApp, id: Id, nuevo: EstadoValidacion): EstadoApp
export function validarPendientes(estado: EstadoApp): EstadoApp    // todas las 'pendiente' → 'validada'
// restricciones (en personas.ts)
export function anadirRestriccion(estado, personaId, r: RestriccionPersona): EstadoApp
export function reemplazarRestriccion(estado, personaId, r: RestriccionPersona): EstadoApp
export function borrarRestriccion(estado, personaId, restriccionId): EstadoApp

// config.ts
export function actualizarConfig(estado: EstadoApp, cambios: Partial<Config>): EstadoApp
export function erroresConfig(config: Config): string[]
```

`erroresPersona`: código vacío; código igual a otro tras `normalizarCodigo` («El código EMP-7 coincide con EMP-07»); fechas no válidas o alta posterior a baja; habilitación de un área o puesto que no existe; horas de contrato u objetivo negativas o > 7 días × 24 h; alias con más de 40 caracteres. `erroresArea`: nombre vacío o repetido en la misma planta, planta entera 0–99, color `#rrggbb`, icono válido. `erroresPuesto`: nombre vacío o repetido en la misma área, área inexistente, plazas entero 1–20, al menos un día, `erroresHorario` del general y de cada día personalizado, días personalizados que no están en `dias` (aviso como error).

Los mensajes de impacto cuentan y nombran: «Se quitarán 12 asignaciones en 3 semanas», «Se quitará la habilitación a 9 personas», «Se quitará de 2 reglas», «Tiene 3 puestos: bórralos o muévelos a otra área antes».

### 9.3 Interfaz

- Componentes en `src/ui/componentes/`: `Confirmacion` (sale de Datos.tsx), campos con etiqueta (`CampoTexto`, `CampoNumero`, `CampoHora`, `CampoDuracion`, `CampoFecha`, `SelectorDias`, `Interruptor`, `SelectorDureza`, `SelectorAmbito`, `ListaMarcable`), `EditorParams` (pinta `campos` de un tipo), `ListaErrores`. Lectura de entradas pura en `entrada.ts`: `leerHora('9:30'|'09:30'|'930') → 570 | null`, `leerDuracion('4h30'|'4:30'|'4,5'|'270 min'|'45 min') → 270 | null`.
- Patrón de edición: lista a la izquierda, ficha a la derecha con **borrador**; «Guardar cambios» (desactivado mientras haya errores, listados junto al botón) y «Descartar cambios». Cada guardado es un paso de deshacer con descripción («Editar EMP-07»). Los interruptores rápidos de la lista (activa) se aplican al momento. Borrar pide confirmación mostrando el `Impacto`; si hay bloqueos, no se ofrece borrar.
- Personas: buscador por código o alias, filtros (activas, equipo, área habilitada), tabla densa; ficha con datos, habilitaciones (por área, con sus puestos), restricciones (añadir por tipo, dureza, activa, nota con el texto de ayuda «Sin datos personales ni motivos: solo lo necesario para planificar»).
- Puestos: áreas por planta (color, icono, activa, orden) y sus puestos; ficha del puesto con horario «Todos los días» y pestañas de días personalizados; tabla de franjas con bloques; ajuste del corte mañana/tarde.
- Reglas: lista con aviso destacado de reglas pendientes de validar (botón «Validar todas»), descripción legible, estado, activa, dura/blanda; ficha con parámetros; «Añadir regla» desde el catálogo.

## 10. Fase 3 · Validador y semáforo

### 10.1 Índice, utilidades y validador (puros)

```ts
// src/validacion/indice.ts
export function crearIndice(datos: DatosPlanificacion, lunes: FechaISO, asignaciones: readonly Asignacion[]): IndiceSemana
export function conAsignacion(indice: IndiceSemana, datos: DatosPlanificacion, a: Asignacion): IndiceSemana   // índice nuevo con `a` añadida (para comprobar)
// src/reglas/util.ts
export function unidades15(min: Minutos): number                 // ceil(min / 15), 0 si min ≤ 0
export function penalizacion(dura: boolean, peso: number, unidades: number): number   // 0 si dura
export function enAmbito(ambito: Ambito, puesto: Puesto): boolean   // vacío = todo
export function etiquetaPersona(p: Persona | undefined): string     // código (nunca el alias: los mensajes pueden acabar exportados)
export function cuando(fecha: FechaISO, intervalo?: Intervalo): string   // «el jueves 26/11 19:00–22:00»
export function incumplimientoGeneral(regla: ReglaGeneral, campos: {...}): Incumplimiento    // rellena reglaId, origen, tipo, dura, penalización
export function incumplimientoRestriccion(r: RestriccionPersona, persona: Persona, campos: {...}): Incumplimiento
/** `comprobar` genérico y coherente con `evaluar` por construcción: evalúa sin y con la candidata. */
export function comprobarPorDiferencia(evaluar: (ctx: ContextoEvaluacion) => Incumplimiento[], ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion
//   permitido = ningún incumplimiento duro nuevo (clave = mensaje); coste = max(0, penalización después − antes); motivos = mensajes nuevos
// src/validacion/validador.ts
export interface Catalogos { general: CatalogoGeneral; restricciones: CatalogoRestricciones }
export function validarSemana(datos: DatosPlanificacion, lunes: FechaISO, asignaciones: readonly Asignacion[], catalogos?: Catalogos): ResultadoValidacion
//   reglas activas y no descartadas; restricciones activas de personas existentes; ordena: duras primero, luego fecha, hora y persona; nunca lanza (si una regla lanza, incumplimiento de aviso «No se pudo comprobar la regla X»)
export function marcasPorAsignacion(r: ResultadoValidacion): Map<Id, MarcaCelda[]>
export function marcasPorHueco(r: ResultadoValidacion): Map<ClaveHueco, MarcaCelda[]>
// src/validacion/resumen.ts
export interface ResumenPersona { personaId: Id; minutosDia: Minutos[] /*7*/; minutosSemana: Minutos; dias: number; porArea: Record<Id, Minutos>; jornadaDomingo: Intervalo | null; objetivo: Minutos | null; desviacion: Minutos | null; avisos: number }
export interface ResumenPuesto { puestoId: Id; huecos: number; cubiertos: number; porcentaje: number /*0–100, entero*/ }
export function resumirSemana(indice: IndiceSemana, datos: DatosPlanificacion, r: ResultadoValidacion): { personas: ResumenPersona[]; puestos: ResumenPuesto[] }
// src/reglas/catalogo.ts (director, tras la tanda 2)
export const CATALOGO: Catalogos
```

Índice: `horario` devuelve null si el puesto o su área están inactivos, si el día no está en `dias` o si hay un `puestoCerrado` que cubre la fecha. `huecos()` = puestos con horario × franjas × plazas, con `bloqueId`. `minutosDia`, `jornada` y `diasTrabajados` solo cuentan asignaciones de puesto cuya franja existe y cuyo puesto tiene horario ese día (no cerrado ni inactivo). `enPlantilla` = activa y `alta ≤ fecha` y (`baja` null o `fecha < baja`). `ausente` = alguna ausencia que cubre la fecha y (tramo null o se solapa con el intervalo). `equipoEfectivo` = `patron` del índice de ciclo de esa semana (`rotacion`: `((diferenciaDias(lunesReferencia, lunes)/7) mod longitudCiclo + longitudCiclo) mod longitudCiclo`) si tiene `equipo`, si no el de la persona. Ignora asignaciones fuera de la semana.

### 10.2 Semántica de cada tipo (`evaluar`)

Mensajes como en CLAUDE.md: «EMP-11 supera 4h30 el jueves 26/11 (5h15)». Penalización blanda: por 15 min en reglas de horas (maxMinutosDia, descanso, minutosSemana, repartoEquitativo, pausaMinima), por ocurrencia en el resto. Marca `aviso` salvo que se diga otra.

**Generales**
- `sinSolapes` (marca `solape`): un incumplimiento por cada **par** de asignaciones (puesto o pausa) de la misma persona y fecha cuyos intervalos se solapan. Incluye Caja 1 y Caja 2 a la vez y Pedidos con otro hueco de su turno.
- `coberturaCompleta` (marca `hueco`): cada tramo vacío. Se agrupan en un incumplimiento las franjas vacías **consecutivas** del mismo puesto, plaza y día («Caja 1 sin cubrir el jueves 26/11 19:00–22:00»), con todas sus claves en `huecos`; unidades = número de franjas. También avisa (marca `aviso`) de asignaciones que no encajan en el horario (franja inexistente ese día, puesto cerrado o inactivo, plaza fuera de rango) y de dos asignaciones en la misma plaza.
- `personaDisponible` (marca `noDisponible`): asignación (puesto o pausa) de una persona inexistente, inactiva, fuera de alta/baja o ausente en ese intervalo. Uno por asignación.
- `habilitacionRequerida` (marca `noDisponible`): puesto con `requiereHabilitacion` y la persona sin su id de puesto ni de área.
- `maxMinutosDia`: por persona y día. Los minutos en áreas con excepción se miden contra el límite de su excepción (null = sin límite); el resto, contra `maxMin`. Unidades = exceso / 15.
- `descansoEntreJornadas`: entre el fin de la jornada de un día y el inicio de la del día siguiente dentro de la semana (más 24 h), si es menor que `minMin`. Unidades = defecto / 15.
- `noRepetirConsecutivas`: misma persona en dos franjas consecutivas (fin = inicio) del mismo puesto dentro del ámbito. Uno por par.
- `mismaPersonaBloque`: en cada bloque (puesto, día, plaza) dentro del ámbito, si las franjas cubiertas no tienen todas la misma persona. Uno por bloque.
- `rotarEntreBloques`: dentro del ámbito, por día, se agrupan los bloques por intervalo; si el conjunto de personas de un grupo es igual (y no vacío) al del grupo inmediatamente anterior en el tiempo, incumple («La pareja EMP-03 y EMP-07 repite en Caja el jueves 26/11 13:00–15:45»). Uno por par de grupos.
- `exclusividadDiaria`: persona con un puesto de `puestoIds` ese día (salvo `diasExcepcion`) y otra asignación de puesto que no está en la lista. Uno por persona y día.
- `respetarEquipo`: franja contraria = de tarde para equipo M, de mañana para T (A nunca). Por persona: días con alguna franja contraria; incumple cada día contrario que no esté en `diasPermitidos` (si no está vacío) y cada día contrario por encima de `maxDiasContrarioSemana` (en orden de fecha).
- `maxDiasSemana`: días trabajados > `max`. Uno por persona.
- `maxFranjasSiSoloArea`: persona que ese día solo tiene asignaciones de puesto en el área y más de `maxFranjas`. Uno por persona y día.
- `comidasEscalonadas`: solo en `dias`. (a) jornada > umbral sin pausa de al menos `duracionMin` contenida en una franja de comida → uno por persona y día. (b) pausa de quien no trabaja ese día (marca `comidaSinTurno`). (c) pausa fuera de toda franja de comida o más corta que `duracionMin`. (d) franja de comida con más pausas que `maxPersonas` (las que se solapan con ella).
- `repartoEquitativo` (solo blanda): por persona con `objetivoCoberturaMinSemana`, unidades = |minutosSemana − objetivo| / 15.

**Restricciones personales** (solo de esa persona; marca `noDisponible` en días, horas y `noAsignarA`)
- `diasDisponibles` / `diasNoDisponibles` / `soloFinesDeSemana`: uno por día trabajado no permitido.
- `noAntesDe` / `noDespuesDe`: en `dias` (vacío = todos), asignación de puesto que empieza antes / termina después de `hora`. Uno por día.
- `maxMinutosDia`: minutosDia > máx. Unidades = exceso / 15.
- `minutosSemana`: < mín o > máx. Unidades = diferencia / 15.
- `maxDiasSemana`: días trabajados > máx.
- `noAsignarA`: asignación de puesto en el ámbito. Uno por asignación.
- `pausaMinima`: jornada > `siJornadaSuperaMin` y ni un hueco sin puesto dentro de la jornada ni una pausa de al menos `pausaMin`. Uno por día.

`comprobar` de todos los tipos = `comprobarPorDiferencia` (el motor de la fase 4 podrá especializar los que sean lentos).

### 10.3 Interfaz · sección Cuadrante

- Selector de semana (lunes; anterior, siguiente, «Esta semana»; muestra la semana del ciclo: «Semana A»). Pestañas por área activa (como sus pestañas de Excel) y vista «Por persona».
- Vista por área: por cada día, una fila por puesto y plaza; las franjas se dibujan como celdas en una línea de tiempo común (anchura proporcional a la duración) con fondo pastel del área. Celda: código (y alias si lo hay), candado si bloqueada, marcas con icono y texto («Solape», «No disponible», «Sin cubrir», «Comida sin turno»). Debajo de cada día, las comidas (pausas) de ese día.
- Editar celda: desplegable de personas (activas y en plantilla ese día primero; las no habilitadas o ya ocupadas a esa hora, al final con su motivo), «Quitar», «Bloquear/Desbloquear». En un bloque, casilla «Aplicar a todo el bloque» (marcada por defecto). Cada cambio, un paso de deshacer: «Asignar EMP-07 a Caja 1, jueves 26/11 10:00–11:30».
- Panel de validación: semáforo con icono y texto; lista de incumplimientos (duras primero) y clic que lleva a la celda (cambia de área si hace falta y la enfoca). Resumen por persona (horas por día y semana, días, por área, jornada del domingo, desviación del objetivo) y cobertura por puesto.
- Vista por persona: su semana (qué huecos tiene cada día) para ver dónde le faltan horas.
- «Vaciar semana» (con confirmación; respeta los candados si se elige).

### 10.4 Pendiente para la fase 4 (de la revisión de la fase 3)

- `comprobarPorDiferencia` compara por conjunto de mensajes: si ese día ya hay un incumplimiento duro con el mismo texto, una candidata que también incumple pasa (noAntesDe, diasNoDisponibles, soloFinesDeSemana, respetarEquipo, exclusividadDiaria, personaDisponible). Además cuesta ~9 ms por candidata (reconstruye el índice). En la fase 4, `comprobar` se especializa por tipo: comprobación directa de la candidata contra el estado de su persona y día, sin reconstruir el índice; el genérico queda solo como referencia en tests de coherencia.
- `comidasEscalonadas` dura: el criterio (a) no debe bloquear en `comprobar` (las pausas se colocan en una pasada posterior del motor, §5.4); solo (b), (c) y (d).
- `validarSemana` recibe `catalogos` obligatorio (evita una importación circular); la app pasa `CATALOGO` de `src/reglas/catalogo.ts`.

## 11. Fase 4 · Motor (plan de trabajo, pendiente de ejecutar)

1. **`comprobar` especializado** en los 25 tipos (sin reconstruir el índice; consulta `dePersonaDia` y suma la candidata). Criterio: `permitido = false` si, tras añadirla, algún incumplimiento duro de la regla incluiría a la candidata en `asignacionIds`; `coste` = penalización blanda después − antes, exacto. No bloquean nunca (solo coste): `coberturaCompleta` (salvo asignación que no encaja), mínimo de `minutosSemana`, `pausaMinima`, `comidasEscalonadas` (a), `repartoEquitativo`. Requisito previo: el `evaluar` de cada tipo pone en `asignacionIds` todas las asignaciones que contribuyen. Test de propiedad: en estados y candidatas aleatorios, el especializado coincide con `comprobarPorDiferencia` + ese criterio.
2. **Núcleo** (`src/motor/`): `azar.ts` (mulberry32), `unidades.ts`, `preparacion.ts` (tres modos, §5.2), `construccion.ts` (§5.3), `comidas.ts` (§5.4), `mejora.ts` (§5.5; Δ con `validarSemana` completo, ~2,5 ms; `maxIteraciones` por defecto 800; rechaza todo movimiento que aumente los incumplimientos duros distintos de huecos), `explicaciones.ts`, `motor.ts` (`generar`, `sugerir`). Orden: construcción → mejora → comidas → reparación de comidas.
3. **Worker** (`trabajador.ts`, `?worker&inline`, alternativa en hilo principal) e **interfaz**: «Generar semana» con modo, progreso, resumen (cobertura, huecos sin cubrir con su explicación, comidas pendientes), aplicar como un paso de deshacer; sugerencias ordenadas en el editor de celda.
4. **Probador**: cobertura 100 % con el ejemplo, determinismo, candados intactos, ninguna dura incumplida salvo huecos vacíos explicados, modos `completarHuecos` y `semanaTipo`, inviabilidad explicada.

### 11.1 API de la fase 4

```ts
// src/motor/motor.ts
export const MAX_ITERACIONES_POR_DEFECTO = 800
export function crearMotor(catalogos: Catalogos): Motor
export const motor: Motor            // = crearMotor(CATALOGO)
// src/motor/trabajador.ts (Web Worker en línea) + src/ui/usarMotor.ts
//   mensajes: { tipo: 'generar', peticion } → { tipo: 'progreso', progreso } … { tipo: 'resultado', resultado } | { tipo: 'error', mensaje }
export function ejecutarMotor(peticion: PeticionMotor, alProgresar: (p: ProgresoMotor) => void): { promesa: Promise<ResultadoMotor>; cancelar(): void }
//   usa `new Worker(new URL('../motor/trabajador.ts', import.meta.url), { type: 'module' })` vía `?worker&inline`; si falla, ejecuta `motor.generar` en el hilo principal (cediendo con setTimeout antes de empezar)
```

## 12. Fase 5 · Rotación, semanas tipo, incidencias y copiar para Excel

Objetivo añadido por el usuario: que la usuaria pueda **probarla en el ordenador o en el móvil**, copiar el contenido y adaptarla a
incidencias de personal (baja, ausencia de horas o días, altas y bajas de plantilla) y de organización (puesto nuevo o cerrado,
temporada alta, nuevas zonas). Por eso «Copiar para Excel» se adelanta de la fase 6 a esta.

Cómo se cubre cada caso con el modelo actual (sin tocar contratos):
- Se pone mala / baja temporal / permiso / vacaciones → **Incidencia de ausencia** (días o tramo horario).
- Entra personal de campaña / alguien deja la empresa → **alta y baja** de la persona (Personas).
- Caja nueva, zona nueva → Puestos (área y puesto nuevos, habilitaciones en Personas).
- Puesto cerrado unos días (obras, inventario) → **Incidencia de cierre de puesto**.
- Temporada alta con un puesto que solo existe unas fechas → **vigencia** `vigenteDesde/vigenteHasta` del `Puesto`
  (inclusive; null = sin límite). Ya hecha (esquema v2): fuera de ella el puesto no existe ese día (sin huecos ni horas),
  la edición quita las asignaciones que queden fuera y la ficha del puesto tiene el grupo «Vigencia».

### 12.1 Rotación y semanas tipo (puros)

```ts
// src/rotacion/semanaTipo.ts
export function asignacionesDeSemanaTipo(datos: DatosPlanificacion, lunes: FechaISO): Asignacion[]  // se mueve aquí desde motor/preparacion (que la re-exporta)
export function semanaTipoDeCiclo(datos: DatosPlanificacion, indiceCiclo: number): SemanaTipo | undefined
export function aSemanaTipo(datos: DatosPlanificacion, lunes: FechaISO, asignaciones: readonly Asignacion[], ids?: () => Id): AsignacionTipo[]
    // solo fechas de esa semana; fecha → dia; sin origen; bloqueada false; omite asignaciones de puesto fuera de horario (motivoFueraDeHorario)
export function calendarioCiclo(rotacion: Rotacion, desdeLunes: FechaISO, semanas: number): { lunes: FechaISO; indice: number; etiqueta: string }[]

// src/edicion/rotacion.ts
export const MAX_CICLO = 12
export function etiquetasPorDefecto(n: number): string[]                      // ['A','B',…]
export function erroresRotacion(r: Rotacion): string[]                         // longitud entera 1–12; lunesReferencia fecha válida y lunes; etiquetas = longitud, no vacías, ≤ 12 caracteres, sin repetir
export function impactoCambiarRotacion(estado: EstadoApp, nueva: Rotacion): Impacto
    // efectos: semanas tipo y pasos de patrón con índice ≥ nueva longitud que se borrarán («Se borrará la semana tipo C»);
    // si cambia lunesReferencia o la longitud: «La semana del 30 nov pasará a ser la B (antes A)» para la semana actual
export function cambiarRotacion(estado: EstadoApp, nueva: Rotacion): EstadoApp    // aplica y borra los huérfanos
export function impactoGuardarSemanaTipo(estado: EstadoApp, lunes: FechaISO, indiceCiclo: number): Impacto
    // bloqueo si la semana no tiene asignaciones válidas; efecto «Reemplazará la semana tipo A (120 asignaciones)»; «Se omiten 3 asignaciones fuera del horario»
export function guardarSemanaTipo(estado: EstadoApp, lunes: FechaISO, indiceCiclo: number, nombre: string, ids?: () => Id): EstadoApp
    // una semana tipo por índice: crea o reemplaza (conserva el id si existía)
export function renombrarSemanaTipo(estado: EstadoApp, id: Id, nombre: string): EstadoApp
export function borrarSemanaTipo(estado: EstadoApp, id: Id): EstadoApp
export function pasoPatron(persona: Persona, indiceCiclo: number): PasoPatron       // el guardado o { indiceCiclo, equipo: null, diasLibres: [] }
export function cambiarPasoPatron(estado: EstadoApp, personaId: Id, paso: PasoPatron): EstadoApp
    // reemplaza o añade; si queda vacío (equipo null y sin días libres) se quita; patron ordenado por indiceCiclo
export function quitarPatron(estado: EstadoApp, personaId: Id): EstadoApp
```

**Días libres del patrón:** `personaDisponible` los trata como no disponibilidad («EMP-07 libra el sábado en la semana B»),
con la semana del ciclo de `semanaDelCiclo(datos.rotacion, indice.lunes)`. `edicion/cuadrante.motivoNoDisponible` devuelve
'libra ese día (rotación)'. El equipo del patrón ya lo usa `respetarEquipo` vía `equipoEfectivo`.

### 12.2 Incidencias (puro) · `src/edicion/incidencias.ts`

```ts
export type Ausencia = Extract<Incidencia, { tipo: 'ausencia' }>
export type Cierre = Extract<Incidencia, { tipo: 'puestoCerrado' }>
export function crearAusencia(personaId: Id, desde: FechaISO, ids?: () => Id): Ausencia      // hasta = desde, tramo null, nota ''
export function crearCierre(puestoId: Id, desde: FechaISO, ids?: () => Id): Cierre
export function anadirIncidencia / reemplazarIncidencia(estado, inc: Incidencia): EstadoApp
export function borrarIncidencia(estado: EstadoApp, id: Id): EstadoApp
export function erroresIncidencia(estado: EstadoApp, inc: Incidencia): string[]
    // fechas válidas; desde ≤ hasta; tramo con inicio < fin dentro de 00:00–24:00; persona o puesto existentes; nota ≤ 200 caracteres
export function avisosIncidencia(estado: EstadoApp, inc: Incidencia): string[]
    // no bloquean: se solapa con otra incidencia de la misma persona o puesto; más de 92 días; persona inactiva o de baja en esas fechas
export interface Afectadas { lunes: FechaISO; asignacionIds: Id[]; conCandado: number }
export function afectadasPor(estado: EstadoApp, inc: Incidencia): Afectadas[]
    // asignaciones de los CUADRANTES (no de semanas tipo) que la incidencia invalida, por semana y en orden:
    // ausencia → puestos y pausas de esa persona en esas fechas (si hay tramo, las que se solapan con él); cierre → asignaciones de ese puesto en esas fechas
export function impactoIncidencia(estado: EstadoApp, inc: Incidencia): Impacto
    // «Afecta a 6 asignaciones ya hechas en 2 semanas (30 nov y 7 dic)»; «2 tienen candado y no se quitarán solas»
export function liberarAfectadas(estado: EstadoApp, inc: Incidencia, soloLunes?: FechaISO): EstadoApp
    // quita las afectadas sin candado; con `soloLunes`, solo las de esa semana (botón «Ir a la semana y recubrir»)
export type Momento = 'pasada' | 'enCurso' | 'futura'
export function momentoIncidencia(inc: Incidencia, hoy: FechaISO): Momento
export function describirIncidencia(inc: Incidencia, datos: DatosPlanificacion): string
    // «EMP-07 ausente del lunes 30 nov al viernes 4 dic», «EMP-07 ausente el martes 1 dic de 10:00 a 13:00», «Caja 2 (Caja) cerrada el sábado 5 dic»
```

### 12.3 Copiar para Excel (§7) · `src/exportar/`

```ts
// excel.ts (puro)
export interface OpcionesExportar { sinAlias: boolean }
export interface TablaExportada { titulo: string; filas: string[][] }   // filas[0] = cabecera; solo texto, sin iconos
export function etiquetaExportada(p: Persona, o: OpcionesExportar): string   // 'EMP-07' o 'EMP-07 (alias)'
export function tablaPorArea(estado: EstadoApp, lunes: FechaISO, areaId: Id, disposicion: Config['exportacionArea'], o: OpcionesExportar): TablaExportada
    // diasEnColumnas: filas = «Puesto · plaza n» + franja «10:00–11:30» (unión ordenada de franjas de la semana), columnas = días «Lun 30/11»;
    // celda = persona o '' (y '—' si el puesto no abre ese día). franjasEnColumnas: la traspuesta.
    // Si hay comidas en el área ese día, una fila final «Comidas» con «EMP-07 14:00–15:00; …»
export function tablaPorPersona(estado: EstadoApp, lunes: FechaISO, o: OpcionesExportar): TablaExportada
    // filas = personas con alguna asignación (orden por código), columnas = días; celda «Caja 1 10:00–13:00; Comida 14:00–15:00»; última columna «Horas» (h:mm)
export function tablaPlana(estado: EstadoApp, lunes: FechaISO, o: OpcionesExportar): TablaExportada
    // Fecha (dd/mm/aaaa), Día, Área, Puesto, Plaza, Franja, Inicio, Fin, Minutos, Persona; comidas con Área '' y Puesto 'Comida'
export function aTSV(t: TablaExportada): string      // tabuladores y saltos dentro de celdas → espacio
export function aHTML(t: TablaExportada): string     // <table> con escape de &<>"; bordes finos; sin colores ni iconos
    // Ambas neutralizan fórmulas: la celda que empieza (tras espacios) por = + - @ lleva un apóstrofo delante.
    // «—» (raya) no es «-» y las horas «10:00–11:30» no empiezan por esos signos, así que no se tocan.
// portapapeles.ts (navegador)
export function copiarTabla(t: TablaExportada): Promise<{ ok: true } | { ok: false; error: string }>
    // D13: navigator.clipboard.write con ClipboardItem(text/html + text/plain) si existe; si falla, evento copy + execCommand('copy')
```

Interfaz: botón «Copiar para Excel» en la barra del Cuadrante → panel con formato (por área [área elegida], por persona, listado plano),
disposición (si es por área), casilla «Exportar sin alias» (marcada por defecto) y «Copiar». Mensaje de resultado con `role="status"`.

### 12.4 Interfaz

- **Rotación:** ciclo (número de semanas, etiquetas, lunes de referencia) con impacto antes de guardar; calendario de las próximas 8 semanas
  con su etiqueta; semanas tipo (una por semana del ciclo): «Guardar la semana del … como semana tipo X» (semana elegida), renombrar, borrar,
  ver resumen (asignaciones por día); patrones por persona: tabla de personas con patrón y «Añadir patrón» (persona → por semana del ciclo:
  equipo «el habitual / M / T / A» y días libres).
- **Incidencias:** «Nueva ausencia» y «Nuevo cierre de puesto»; ficha con persona o puesto, desde, hasta, «Todo el día» o tramo, nota con la
  ayuda «Sin motivos ni datos personales: solo lo necesario para planificar». Al guardar, si afecta a asignaciones hechas: panel con
  «Quitar las afectadas» (un paso de deshacer) e «Ir a la semana y recubrir» (abre el Cuadrante en esa semana y lanza Generar en modo
  «Completar huecos»). Lista filtrable (en curso y próximas / pasadas / todas; búsqueda por código o puesto) con momento en texto.
- **Móvil:** ancho mínimo útil 360 px: pestañas con desplazamiento horizontal, rejilla del cuadrante con desplazamiento dentro de su caja,
  fichas en una columna, botones de al menos 40 px de alto.

## 13. Horario semanal de la plantilla (importado)

La semana anterior le pasan a la usuaria el horario de cada persona (quién trabaja de mañana o de tarde, qué días, cuántas horas, domingos…).
Con él se hace el cuadrante: **el horario dice quién está y cuándo; el cuadrante reparte a esas personas entre los puestos.**
Modelo (contrato, esquema v3): `DatosPlanificacion.horarios: Record<lunes, HorarioSemana>`, `HorarioSemana { lunes, turnos: TurnoDia[], actualizado }`,
`TurnoDia { personaId, fecha, tramos: Intervalo[] }` (tramos vacío = libra; varios tramos = turno partido).

Semántica: si la semana tiene horario, cada persona solo está disponible dentro de los tramos de su turno de ese día; quien no figura
no trabaja esa semana. Sin horario para la semana, no hay limitación. Se aplica en `personaDisponible` (evaluar y comprobar),
así que el validador, el motor, las sugerencias y el modo «semana tipo» lo respetan sin más cambios. No se inventan reglas
nuevas (p. ej. «hay que ocupar todo su turno»): eso queda pendiente de que la usuaria lo confirme.

### 13.1 Lectura del horario pegado desde Excel · `src/importar/horario.ts` (puro)

```ts
export interface TurnoConLetra { letra: string; nombre: string; tramos: Intervalo[] }   // 'M' Mañana 10:00–15:45; 'T' Tarde 15:45–22:00
export function letrasPorDefecto(datos: DatosPlanificacion): TurnoConLetra[]
    // M: [primer inicio de franja de los puestos activos → corte), T: [corte → último fin); si no hay puestos, 10:00 / corte / 22:00
export interface CeldaLeida { texto: string; tramos: Intervalo[]; libre: boolean; error: string | null }
export function codigoCanonico(codigo: string): string   // 'emp 7' → 'EMP-07' (también la usa crearPersonasDesdeCodigos)
export function leerCelda(texto: string, letras: readonly TurnoConLetra[]): CeldaLeida
    // '' · 'L' · 'V' · 'libre' · 'libranza' · 'permiso' · 'descanso' · 'descanso semanal' · 'D' · 'fiesta' · '-' · '—' y cualquier texto que empiece por
    //   «baja» o «vac» ('Baja médica', 'Vac.', 'vacaciones') → libre (solo tramos vacíos: nunca se guarda el texto ni el motivo)
    // horas con segundos ('10:00:00-15:45:00') valen
    // '10:00-15:45' · '10-15:45' · '10.00 a 15.45' · '10:00–15:45' · '10h-15:45h' → un tramo; 'a', '-', '–', '—' como separador
    // '10:00-14:00 / 17:00-21:00' · '10-14 y 17-21' · '10-14, 17-21' → partido (ordenado, sin solapes)
    // letra o nombre del turno sin distinguir mayúsculas ni tildes: 'M', 'mañana', 'T', 'Tarde'; 'M+T' o 'M/T' → unión
    // cualquier otra cosa → error legible «No entiendo "xx": escribe un horario como 10:00-15:45, M, T o L»
    // tramo con fin ≤ inicio o fuera de 00:00–24:00 → error
export interface FilaLeida { linea: number; codigo: string; personaId: Id | null; dias: (CeldaLeida | null)[] }  // 7 posiciones, lunes…domingo; null = esa columna no venía
export interface LecturaHorario {
  lunes: FechaISO; filas: FilaLeida[];
  columnas: string;                     // descripción de lo detectado: «Código en la columna 1; lunes a domingo en las columnas 2 a 8»
  errores: string[];                    // bloquean guardar: sin columna de códigos, sin días, celdas no entendidas (con persona y día)
  avisos: string[];                     // no bloquean: códigos que no existen, códigos repetidos (gana la última fila), personas activas que no figuran
  codigosDesconocidos: string[];
}
export function leerHorario(texto: string, lunes: FechaISO, datos: DatosPlanificacion, letras: readonly TurnoConLetra[]): LecturaHorario
    // separador: tabulador (Excel); si no hay, ';' o ','. Filas vacías fuera. Las líneas y celdas se parten al estilo TSV de Excel:
    //   una celda entrecomillada puede contener saltos de línea (se tratan como separador de tramos, p. ej. un partido con Alt+Intro) y «""» es una comilla literal.
    // Cabecera: la fila con 2+ celdas que sean días (lun, lunes, L…D no: ambiguo; 'lu','ma','mi','ju','vi','sa','do' sí) o fechas dd/mm[/aaaa] de esa semana;
    //   una celda de cabecera solo cuenta si es SOLO un nombre de día, SOLO una fecha o «nombre fecha» (y no encaja como tramo horario: '10-14' no es fecha),
    //   así una primera fila de horas sin cabecera no se confunde con ella. Si la cabecera trae fechas (con o sin nombre) de otra semana: error bloqueante
    //   «La cabecera es de la semana del 23/11, no de la del 30/11. Cambia la semana o revisa lo pegado.»; las columnas de día se asignan por nombre o por fecha. Sin cabecera: las 7 columnas siguientes a la del código son lunes…domingo.
    // Columna de código: la que más celdas tenga que coincidan con un código existente tras normalizarCodigo (persistencia/coherencia.ts);
    //   si ninguna coincide, la primera columna con aspecto de código (letras+número).
    // Filas cuyo código no existe: personaId null y su código en codigosDesconocidos (se pueden crear).
    // Si ninguna fila tiene una persona conocida: error bloqueante «No se ha reconocido ningún código de la plantilla (EMP-…)…» (el botón de crear personas sigue).
```

### 13.2 Edición pura · `src/edicion/horarios.ts`

```ts
export function turnoDe(datos: DatosPlanificacion, personaId: Id, fecha: FechaISO): Intervalo[] | null   // null = la semana no tiene horario
export function enTurno(datos: DatosPlanificacion, personaId: Id, fecha: FechaISO, iv: Intervalo): boolean  // true si no hay horario o iv cabe entero en un tramo
export function horarioDesdeLectura(lectura: LecturaHorario, ahora: string | null = null): HorarioSemana   // solo filas con personaId; días null → libra; código repetido: gana la última fila
export function impactoGuardarHorario(estado: EstadoApp, horario: HorarioSemana): Impacto
    // bloqueos: ninguno; efectos: «Reemplazará el horario de la semana del 30 nov», «12 asignaciones ya hechas quedan fuera de turno
    // (EMP-07 martes…): puedes recubrirlas desde el Cuadrante», «3 personas activas no figuran y no trabajarán esa semana»
export function guardarHorario(estado: EstadoApp, horario: HorarioSemana): EstadoApp
export function quitarHorario(estado: EstadoApp, lunes: FechaISO): EstadoApp
export function cambiarTurno(estado: EstadoApp, lunes: FechaISO, personaId: Id, fecha: FechaISO, tramos: Intervalo[], ahora?: string | null): EstadoApp
    // si se pasa `ahora`, actualiza `actualizado` (null también); sin él lo conserva
export function crearPersonasDesdeCodigos(estado: EstadoApp, codigos: readonly string[], ids?: () => Id): EstadoApp  // como crearPersona, con ese código, sin habilitaciones
export function semanaConHorario(datos, fecha): boolean        // añadidos: ¿la semana de esa fecha tiene horario?
export function figuraEnHorario(datos, personaId, lunes): boolean   // ¿tiene entrada (aunque sea 'libra') en el horario de esa semana?
export function minutosDeTurno(horario: HorarioSemana, personaId: Id): Minutos
export function describirTurno(tramos: Intervalo[] | null): string   // 'Libra' · '10:00–15:45' · '10:00–14:00 y 17:00–21:00' · 'Sin horario'
```

`personaDisponible` (solo asignaciones de puesto; las pausas no se marcan por horario): «EMP-07 no está de turno a esa hora (su turno: 10:00–15:45) y tiene
asignación el martes 01/12 10:00–11:30», «EMP-07 libra según el horario de la semana y tiene asignación…», «EMP-07 no figura en el horario de la semana y tiene asignación…»
(mismo patrón «persona + motivo + asignación» que el resto de motivos de la regla). `edicion/cuadrante.motivoNoDisponible`: 'fuera de su turno' / 'libra según el horario'.
**Horario y rotación:** si la semana tiene horario de la plantilla, el horario manda: no se aplican los `diasLibres` del patrón de rotación esa semana
(el horario ya es el real que pasan); lo hacen `personaDisponible` y `edicion/cuadrante.motivoNoDisponible`. Sin horario, sigue mandando el patrón.
`borrarPersona` quita también sus turnos. `comprobarCoherencia` avisa de turnos de personas inexistentes o con fecha fuera de su semana.

### 13.3 Interfaz

- **Página «Horarios»** (§14; antes tarjeta de Datos): pegar, «Leer horario», lo detectado con «Primer día de la tabla», semanas a guardar, vista previa de una semana,
  avisos, personas nuevas (alias y habilitaciones) y «Guardar el horario de N semanas» (con impacto y un solo `aplicar`). Debajo, lista de semanas con horario con «Ver y editar» (rejilla con `leerCelda`) y «Quitar».
- Rejilla «Ver y editar»: el botón pasa a «Cerrar»; cerrarla o abrir otra semana con cambios sin guardar pide confirmación; se reinicia si el horario guardado
  cambia (guardar, deshacer, rehacer). «Importar horario» del Cuadrante abre Horarios con la semana que se estaba viendo como primera a guardar y lleva el foco al título.
- **Cuadrante**: aviso bajo la barra de semana: «Horario de la plantilla cargado (27 personas)» o «Esta semana no tiene horario de la
  plantilla: se puede asignar a cualquiera a cualquier hora» con botón «Importar horario». En la vista Por persona, el turno de cada día.
- **Resumen por persona**: horas de turno junto a las horas asignadas, si hay horario.

## 14. Horario anual pegado desde la hoja de la empresa

Formato real observado (datos de muestra con nombres cambiados; **no se guardan en el repositorio**): una fila por persona,
sin cabecera: `número de empleado (8 cifras)` · `NOMBRE` · una columna por día **consecutivo de todo el año** (365 columnas desde
el 1 de enero). Celdas: `15:20 22:10` (entrada y salida separadas por espacio), `L` libra (a veces con espacios), códigos sin horas
(`V`, `E`, `B`, `V7R`, `VKS`, `VXS`, `VKY`, `VD6`, `VGZ`…: vacaciones, bajas u otros; **no se interpreta ni se guarda el motivo**),
y casillas vacías (si una columna está vacía para todas las filas, es un día que no se abre).
También debe valer con códigos alfanuméricos (`A1234B`) o EMP-xx.

Decisiones:
- **Persona:** el número o código va a `Persona.codigo`; el nombre, si viene, va a `Persona.alias` (solo vive en ese navegador y la
  exportación puede excluirlo; casilla «Guardar el nombre como alias», marcada). En tests y en el repo solo datos ficticios.
- **Celdas sin horas:** cualquier texto sin horas (que no parezca una hora mal escrita) = no trabaja ese día. Se resume como aviso
  «Códigos sin horario: L (412), V (96), E (70)…: esos días no trabaja». Una hora mal escrita (`15:2O 22:10`, `25:00 26:00`) sí es error.
- **Calendario:** si hay más de 7 columnas de día y no hay cabecera de fechas, se pide «Primer día de la tabla» (por defecto, 1 de enero
  del año en curso si hay 365 o 366 columnas). Se convierten a `HorarioSemana` solo las **semanas completas** (lunes a domingo dentro
  de la tabla); las semanas parciales del principio y del final se avisan y no se guardan. Se eligen las semanas a guardar
  («desde la semana del … hasta la del …», por defecto desde la semana actual hasta el final).
- **Página propia «Horarios»** (pestaña entre Incidencias y Datos) con la importación; se quita de Datos.
- Personas nuevas: se crean con el código, el alias (nombre) y las **habilitaciones elegidas** en la importación (por defecto todas las
  áreas activas), para que el generador pueda usarlas desde el primer momento.

Implementación (H3): `leerCalendario` y `horariosDesdeCalendario` en `src/importar/horario.ts`; `guardarHorarios`, `impactoGuardarHorarios`,
`ponerAliasDesdeNombres` y las opciones de `crearPersonasDesdeCodigos` en `src/edicion/horarios.ts`; interfaz en `src/ui/secciones/Horarios.tsx`.
`leerCelda` ya no da error por texto sin horas (devuelve `codigo`); solo es error lo que parece una hora mal escrita. Las celdas con error van en
`LecturaCalendario.celdasConError` y solo bloquean si caen en las semanas elegidas (`errores` es solo de estructura). `leerHorario` (semanal) se conserva por compatibilidad.
