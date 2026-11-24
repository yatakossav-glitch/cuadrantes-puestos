# Prompt para Claude Code · App de cuadrantes de puestos (juguetería y librería)

> Uso: pegar en Claude Code en una carpeta vacía. La **sesión principal en Opus** (esfuerzo alto), que hace de **diseñador y director**. Los **subagentes en Sonnet** construyen y prueban, y un subagente en **Opus** revisa (ver §13). Empezar en **modo plan**.
> Antes de pegar, rellenar la sección **«REGLAS VALIDADAS»** con el texto de la usuaria.

---

## 1. Qué quiero que construyas

Una aplicación web para que una responsable de equipo haga los **cuadrantes semanales de cobertura de puestos** (cajas, pedidos web, zona expositora…) de dos plantas de un gran almacén. Hoy lo hace a mano en Excel. La app debe:

1. Gestionar **personas**, **puestos** y **reglas**, todo editable (añadir, quitar, desactivar).
2. **Proponer automáticamente** el cuadrante de una semana respetando las reglas.
3. Permitir **retoques manuales** con validación en vivo.
4. **Exportar** el resultado para pegarlo en Excel.

Interfaz en **español de España**. Usuaria no técnica: todo debe entenderse sin manual.

## 2. Restricciones técnicas (no negociables)

- **Entorno cerrado:** se usará desde un ordenador corporativo donde no se pueden subir ni descargar archivos y probablemente hay bloqueos de red. Por tanto:
  - Entregable final: **un único `index.html` autocontenido** (JS y CSS embebidos), **sin ninguna petición externa** en ejecución: nada de CDN, fuentes web, analítica ni APIs. Debe funcionar abierto desde una URL estática (GitHub Pages) o servido localmente.
  - Compatible con **Microsoft Edge y Chrome** actuales. Pantalla de escritorio (1366×768 como mínimo); en móvil basta con que se pueda consultar.
- **Persistencia:** `localStorage` (o IndexedDB), con escrituras dentro de try/catch y aviso si falla.
- **Copias de seguridad sin archivos:** botón «Exportar datos» que genera un **bloque de texto** (JSON comprimido y codificado en base64, con versión de esquema) para copiar al portapapeles, y botón «Importar datos» donde se pega ese texto. Incluye migraciones entre versiones de esquema.
- **Privacidad:** los datos nunca salen del navegador. Las personas se identifican por **código** (p. ej. `EMP-07`). Habrá un campo opcional «alias visible» que solo vive en ese navegador y que la exportación permite **excluir** (casilla «exportar sin alias»). No se guarda nunca el **motivo** de una restricción (guarda legal, salud…): solo la restricción en sí.
- Stack sugerido: TypeScript + Vite + `vite-plugin-singlefile`, tests con Vitest. Si propones otro, justifícalo en el plan.

## 3. Modelo de datos (todo configurable desde la interfaz)

### 3.1 Áreas y puestos
- **Área:** nombre, planta (3, 4…), color, icono, activa/inactiva.
- **Puesto:** área, nombre (Caja 1, Caja 2, Puesto único…), **plazas simultáneas**, días en que existe, activo/inactivo.
- **Franjas:** cada puesto tiene una lista editable de franjas (inicio–fin) que **pueden variar por día de la semana** (el domingo puede ser distinto).
- **Bloques:** se pueden agrupar franjas consecutivas en un bloque que exige **la misma persona** en todas sus franjas (p. ej. caja 10:00–13:00 = dos franjas).
- **Habilitación requerida:** un puesto puede exigir una habilitación (p. ej. solo el personal habilitado puede ir a Pedidos).
- **Turno partido de referencia:** hora de corte mañana/tarde configurable (hoy, 15:45).

### 3.2 Personas
- Código, alias opcional, **equipo** (Mañana / Tarde / Ambos), **habilitaciones** (multiselección de áreas o puestos), activa/inactiva, fecha de alta y de baja.
- **Restricciones** por persona: lista donde se añaden, editan, desactivan o borran, y cada una se marca como **dura** o **blanda (con peso)**. Tipos (catálogo ampliable en código con poco esfuerzo):
  - Días disponibles / días que no puede trabajar.
  - No antes de HH:MM / no después de HH:MM (por día o todos).
  - Máximo de horas al día; mínimo y máximo de horas a la semana.
  - Máximo de días a la semana.
  - Solo fines de semana.
  - No asignar a un puesto o área concretos.
  - Comida o pausa mínima si la jornada supera X horas.
  - **Ausencia temporal** con fechas (vacaciones, baja, permiso). Se muestra como incidencia, no como regla fija.
- Cada restricción lleva una nota opcional **sin datos personales** (la interfaz lo recuerda con un texto de ayuda).

### 3.3 Reglas generales
- Las reglas son **datos, no código fijo**: cada una es un tipo de regla con parámetros, **activable o desactivable**, **dura o blanda (peso)**, y con una descripción legible.
- Catálogo inicial de tipos (todos parametrizables):
  - Sin solapes: nadie en dos puestos a la vez.
  - Máximo de horas por persona y día (con excepción por área; p. ej. Pedidos permite un turno entero).
  - Descanso mínimo entre jornadas (horas).
  - No repetir en el mismo puesto en franjas consecutivas (por puesto).
  - Misma persona durante todo el bloque (por bloque).
  - Exclusividad diaria: quien hace el puesto X ese día no hace nada más (con días de excepción).
  - Respetar el equipo M/T (con excepciones permitidas: un día al contrario como máximo, etc.).
  - Máximo de días a la semana por persona.
  - Comidas escalonadas: en ciertos días (hoy, solo el domingo), quien tenga una **jornada de más de X horas medida desde el inicio de su primer hueco hasta el fin del último** (no la suma de horas; hoy X = 8, editable) necesita una comida de N minutos en franjas definidas. La comida no puede coincidir con un puesto suyo, solo se asigna a quien trabaja ese día y respeta el número máximo de personas por franja de comida **sin dejar puestos descubiertos**.
  - Reparto equitativo de horas (blanda): minimizar la desviación respecto al objetivo de cada persona.
- Se pueden **añadir** reglas nuevas desde la interfaz a partir de cualquier tipo del catálogo.
- Las reglas iniciales se cargan con estado **«pendiente de validar»** hasta que la usuaria las confirme (ver §9).

### 3.4 Rotación
- Las semanas son **rotatorias**. Ciclo de N semanas (A, B, C…) configurable.
- Para cada semana del ciclo se puede guardar una **semana tipo** (cuadrante base).
- Para cada persona, opción de patrón rotatorio: equipo M/T alterno, días libres que rotan, etc.
- Dada una fecha, la app sabe en qué semana del ciclo cae y parte de esa semana tipo.

### 3.5 Cuadrante
- Asignación = (fecha, puesto, franja, persona). Las asignaciones manuales se pueden **bloquear con un candado** para que el generador no las toque.
- Las comidas también son asignaciones (tipo «pausa»).

## 4. Motor de asignación

- **Modos:**
  1. *Generar semana desde cero.*
  2. *Partir de la semana tipo y aplicar incidencias:* solo vuelve a cubrir los huecos afectados (ausencias, cambios) y mantiene el resto. **Este es el modo principal.**
  3. *Completar huecos:* rellena lo vacío sin tocar lo asignado.
- **Estrategia:** heurística constructiva que empieza por lo más restrictivo (puestos con habilitación y turno entero → bloques → franjas sueltas → comidas) y después mejora con búsqueda local (intercambios) para minimizar la penalización de las reglas blandas. Con semilla determinista: el mismo resultado para la misma entrada. Con límite de tiempo (máximo ~3 s) e indicador de progreso.
- **Inviabilidad explicada:** si un hueco no se puede cubrir, lo deja vacío y explica por qué («nadie habilitado disponible el jueves 19:00–22:00: EMP-03 ya está en Caja 1, EMP-11 supera 4h30…»).
- **Sugerencias manuales:** al pulsar un hueco, la app ofrece la lista de personas compatibles ordenada por idoneidad y muestra qué reglas blandas empeoraría cada una.

## 5. Validación

- Validación en vivo con **semáforo** global (verde, ámbar = solo blandas, rojo = alguna dura incumplida) y lista de incidencias con un clic que lleva a la celda.
- Contadores por persona: horas de cobertura por día y semana, días trabajados y desviación respecto a su objetivo.
- Cobertura por puesto: porcentaje cubierto y huecos.

## 6. Interfaz

Secciones: **Cuadrante** (por defecto) · **Personas** · **Puestos** · **Reglas** · **Rotación** · **Incidencias** · **Datos** (importar y exportar).

- **Vista cuadrante:** rejilla por día con los puestos en filas y las franjas en columnas. Cambio de vista **por área** (equivalente a sus pestañas de Excel) y **por persona**. Se puede arrastrar y soltar entre celdas, con validación inmediata.
- **Estética sobria y profesional**, de herramienta de gestión: tipografía del sistema, buena densidad de información y alto contraste. **Nada de emojis.** Iconografía con **iconos SVG de línea embebidos** (estilo Lucide), pequeños y en gris, solo donde ayudan: área, candado, aviso, ausencia, comida. Cada área tiene un **color de acento suave** (fondo pastel en las celdas) configurable. Los colores nunca son la única señal: van acompañados de icono o texto.
- Deshacer y rehacer (al menos 20 pasos).
- Vista de impresión limpia (A4 apaisado).

## 7. Exportar a Excel

- Botón **«Copiar para Excel»** que pone en el portapapeles **`text/html` (tabla) y `text/plain` (TSV)** a la vez, para que al pegar en Excel cada dato caiga en su celda. Formatos:
  - Por área, uno por pestaña (mismo esquema que su Excel actual: días en columnas y franjas en filas, o al revés, configurable).
  - Por persona (horario semanal individual).
  - Listado plano (fecha, día, área, puesto, franja, inicio, fin, minutos, persona), equivalente a una base de datos.
- Sin emojis ni iconos en lo exportado: solo texto.

## 8. Datos de ejemplo y tests

- Incluye un **conjunto de datos de ejemplo totalmente ficticio** (códigos EMP-01…29, sin nombres) que reproduzca la estructura descrita en §10, para probar.
- **Tests unitarios** de cada tipo de regla (casos que cumplen y casos que incumplen) y del motor (cobertura completa en el ejemplo, determinismo, respeto de los candados).
- **Test de regresión:** con un cuadrante de ejemplo con 4 solapes introducidos, el validador debe detectar exactamente esos 4.
- Antes de darlo por terminado: revisión con un subagente que no haya escrito el código (correctitud de reglas, accesibilidad, ausencia de peticiones de red con un test que lo compruebe).

## 9. Plan por fases (para y espera mi OK entre fases)

1. **Modelo de datos + persistencia + importar/exportar** con datos de ejemplo.
2. **Editores** de personas, puestos, reglas y restricciones.
3. **Validador** y semáforo sobre un cuadrante editado a mano.
4. **Motor** (los tres modos) con explicaciones de inviabilidad.
5. **Rotación, semanas tipo e incidencias.**
6. **Copiar para Excel**, vista de impresión y pulido visual.
7. Build final en un único `index.html` + README breve para la usuaria (cómo usarla, cómo hacer copia de seguridad).

## 10. Contexto observado (planta 3, juguetería)

*Extraído de un cuadrante real ya hecho. Son **patrones observados**, no reglas confirmadas: cárgalos como configuración inicial en estado «pendiente de validar».*

- Cobertura de 10:00 a 22:00, los 7 días, con 4 plazas simultáneas. El corte entre mañana y tarde es a las 15:45.
- **Pedidos Web (1 plaza, requiere habilitación):** mañana 10:00–15:45 y tarde 15:45–22:00. Una persona por turno y día; quien lo hace ese día no hace nada más (con excepciones en domingo).
- **Caja (2 plazas: Caja 1 y Caja 2):** franjas de mañana 10:00–11:30, 11:30–13:00, 13:00–14:30, 14:30–15:45; franjas de tarde 15:45–17:20, 17:20–19:00, 19:00–20:40, 20:40–22:00. **Bloques con la misma pareja:** 10:00–13:00, 13:00–15:45, 15:45–19:00, 19:00–22:00. Entre bloques, la pareja cambia.
- **Exposición LEGO (1 plaza):** mañana en 6 franjas de unos 57–58 min entre 10:00 y 15:45; tarde en 5 franjas de 75 min entre 15:45 y 22:00. Nadie repite en franjas consecutivas. Quien solo hace LEGO, una franja al día.
- **Máximo diario fuera de Pedidos: 4h30** (encaja con un bloque de caja de 3h15 más una franja de LEGO de 1h15).
- Cada persona pertenece al equipo de mañana o al de tarde. Mezclar ambos en un mismo día solo ocurre en domingo y como excepción puntual.
- **Domingo:** régimen especial con jornadas más largas y **comida de 1 h** escalonada en 14:00–15:00 (4 personas), 15:00–16:00 (4) y 16:00–17:00 (3), sin descubrir puestos.
- Nadie trabaja 7 días (máximo 6). La carga semanal de cobertura va de unas 4 h a unas 24 h.
- Polivalencias observadas: perfiles que hacen Pedidos + Caja + LEGO, Caja + LEGO, Pedidos + Caja, Pedidos + LEGO, solo Pedidos y solo LEGO.
- Las horas observadas son **de cobertura de puestos**, no de contrato: el resto de la jornada se dedica a sala y reposición. Prevé un campo de horas de contrato por persona, distinto de las horas de cobertura.
- **Planta 4 (librería): pendiente de definir.** El modelo debe admitir varias plantas desde el principio.

### 10.1 Lo que ya hace su Excel actual (mínimo que la app debe igualar)

Hoy usa un Excel que **valida pero no genera**. La app no puede quedarse por debajo en nada de esto:

- **Semana:** se elige el lunes de la semana y todo el cuadrante cuelga de esa fecha.
- **Asignación:** un desplegable por hueco con las personas activas. Borrar deja el hueco vacío.
- **Barra de avisos en directo:** huecos sin cubrir, solapes, personas de baja asignadas y comidas sin turno. Verde si todo está bien (equivale al semáforo de §5).
- **Colores de aviso en la celda:** rojo = solape el mismo día; naranja = persona de baja o fuera de la plantilla; amarillo = comida asignada a quien no trabaja ese domingo. Mantén este código de colores, siempre con icono o texto de apoyo.
- **Resumen por persona:** horas por día y por semana, días trabajados, turnos por área, jornada del domingo y avisos.
- **Ficha de persona:** en qué huecos está, para ver dónde le faltan horas.
- **Vistas por área (4):** listas para imprimir o enviar. En la app, las vistas por área con «Copiar para Excel» e impresión.
- **Plantilla:** alta y baja de personas; quien está de baja desaparece de los desplegables.
- **Solapes:** incluyen Caja 1 y Caja 2 a la vez, y Pedidos con cualquier hueco de su turno.
- **Calidad de datos:** los nombres llegaban escritos de varias formas y había que unificarlos. Con códigos (EMP-xx) este problema desaparece; la importación debe avisar de duplicados probables.
- **Límites que su Excel no tiene, por falta de datos:** contrato, horas máximas y días libres por persona. Por eso la app los modela como restricciones opcionales (§3.2) y no avisa de «horas de más» hasta que estén rellenos.

## 11. REGLAS VALIDADAS (las rellena la usuaria)

> *Pegar aquí el texto de la usuaria. Para cada regla: dura / blanda / descartada, y los parámetros. Este bloque **manda** sobre §10 si hay contradicción.*

```
[PEGAR AQUÍ]
```

## 12. Cómo quiero que trabajes

- Empieza en **modo plan**: resume lo que has entendido, enumera dudas y ambigüedades (máximo 10, priorizadas) y propón la arquitectura. Espera mi OK.
- No inventes reglas de negocio: si algo no está claro, pregunta o déjalo configurable.
- `git init` al empezar y commits pequeños por tarea, con mensajes en español.

## 13. Orquestación con subagentes (Opus diseña, Sonnet construye)

### 13.1 Reparto de papeles
- **Tú, sesión principal en Opus:** diseñas, defines los contratos, repartes tareas, integras y decides. **No escribes código de funcionalidad salvo excepción** (ver 13.4): tu trabajo es la arquitectura y la calidad.
- **`constructor` (Sonnet):** implementa una tarea acotada contra los contratos.
- **`probador` (Sonnet):** escribe tests de caja negra **a partir de la especificación, no del código**, para que los tests no hereden los errores de la implementación.
- **`revisor` (Opus, solo lectura):** revisa cada fase sin haber escrito nada. No edita.

### 13.2 Fase 0 (antes de nada, tú en persona)
1. Crea los tres subagentes en `.claude/agents/` con el contenido de 13.5.
2. Escribe **`ARQUITECTURA.md`**: módulos, flujo de datos, algoritmo del motor en pseudocódigo y decisiones tomadas.
3. Escribe los **contratos en código**: `src/modelo/tipos.ts` (todo el modelo de §3), la interfaz común de regla (p. ej. `evaluar(cuadrante, contexto) → Incumplimiento[]`, con metadatos de dura/blanda, peso y parámetros) y el esquema versionado de persistencia.
4. Escribe un **`CLAUDE.md`** del proyecto con las convenciones: estructura de carpetas, nombres en español, «no tocar contratos sin permiso del director» y cómo ejecutar los tests.
5. Para y espera mi OK.

### 13.3 Ciclo de cada fase (de §9)
1. Divide la fase en tareas pequeñas: **un módulo o un tipo de regla por tarea**, cada una con archivos de salida explícitos.
2. Delega en `constructor`. **En paralelo solo si las tareas tocan archivos distintos** (caso ideal: cada tipo de regla en `src/reglas/<tipo>.ts` con su test). Como máximo 4 o 5 a la vez. Si se pisan archivos, en serie.
3. A la vez, `probador` escribe los tests de caja negra de esa fase desde §3–§8.
4. Integras, ejecutas toda la batería y corriges los conflictos.
5. `revisor` revisa la fase. Tú decides qué hallazgos se arreglan y los delegas.
6. Commit, resumen de 5 líneas para mí y **para hasta mi OK**.

### 13.4 Reglas de dirección
- Los subagentes **no cambian contratos** (tipos, interfaz de regla, esquema). Si creen que hace falta, paran y te lo devuelven, y tú decides.
- Cada subagente devuelve un **resumen corto** (máximo 15 líneas: archivos tocados, tests y estado, dudas), nunca volcados de código, para no llenar tu contexto.
- **El motor (fase 4) es la pieza crítica:** tú lo diseñas al detalle en `ARQUITECTURA.md` y lo implementa `constructor`. Si sus tests fallan **dos veces seguidas**, lo tomas tú directamente.
- Si una tarea no encaja en ningún subagente o es trivial (renombrar, ajustar una línea), hazla tú sin delegar.

### 13.5 Definición de los subagentes

`.claude/agents/constructor.md`
```markdown
---
name: constructor
description: Implementa una tarea concreta del plan (un módulo, una pantalla o un tipo de regla) contra los contratos de ARQUITECTURA.md y src/modelo. Úsalo para escribir código encargado por el director.
model: sonnet
effort: medium
tools: Read, Write, Edit, Glob, Grep, Bash
---
Eres el constructor. Implementas solo la tarea que te encargan, en los archivos indicados.
- Lee primero CLAUDE.md, ARQUITECTURA.md y los tipos de src/modelo.
- No modifiques contratos (tipos, interfaz de regla, esquema). Si hace falta, para y explícalo.
- Escribe tests unitarios de lo que implementas y ejecútalos antes de terminar.
- Código claro, TypeScript estricto, nombres en español, sin dependencias nuevas sin permiso.
- Devuelve un resumen de máximo 15 líneas: archivos tocados, estado de los tests y dudas.
```

`.claude/agents/probador.md`
```markdown
---
name: probador
description: Escribe tests de caja negra a partir de la especificación (no del código) para una fase o módulo. Úsalo en paralelo al constructor.
model: sonnet
effort: medium
tools: Read, Write, Edit, Glob, Grep, Bash
---
Eres el probador. Escribes tests a partir de la especificación del prompt y de ARQUITECTURA.md, no mirando la implementación.
- Solo escribes en tests/. Nunca tocas src/.
- Cubre casos que cumplen, casos que incumplen y casos límite (franjas que se tocan sin solaparse, domingo, persona sin habilitación, candados).
- Usa solo los datos ficticios EMP-xx.
- Ejecuta la batería y devuelve un resumen de máximo 15 líneas: qué falla y por qué crees que falla.
```

`.claude/agents/revisor.md`
```markdown
---
name: revisor
description: Revisa una fase terminada sin haberla escrito: correctitud de reglas y motor, privacidad, ausencia de peticiones de red, accesibilidad y fidelidad a la especificación. Úsalo al cerrar cada fase.
model: opus
effort: high
tools: Read, Glob, Grep, Bash
---
Eres el revisor. No editas nada: solo lees, ejecutas tests y builds, e informas.
Comprueba:
1. Que el código hace lo que dice la especificación (§3–§8) y ARQUITECTURA.md.
2. Que las reglas duras nunca se incumplen en lo que genera el motor.
3. Que no hay ninguna petición de red, recurso externo ni nombre real en datos o tests.
4. Contraste, teclado y estados vacíos y de error.
Devuelve los hallazgos ordenados por gravedad (crítico, importante, menor), cada uno con su archivo y línea, y una propuesta de arreglo. Máximo 25 líneas.
```
