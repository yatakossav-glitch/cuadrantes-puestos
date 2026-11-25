# Guía de uso · Cuadrantes de puestos

Guía rápida para hacer los cuadrantes semanales. Está pensada para consultarla a saltos: busca el apartado que necesites.

---

## 1. Qué es y qué hace

- Es una aplicación para preparar la cobertura semanal de los puestos (cajas, pedidos web, exposición…).
- Propone un cuadrante completo respetando las reglas que tú has validado.
- Te deja corregirlo a mano y te avisa al momento si algo no cuadra.
- Se adapta a imprevistos: bajas, ausencias, personal nuevo, puestos cerrados.
- Copia el resultado para pegarlo en Excel.

### Dónde se guardan los datos

- Los datos se guardan **solo en este navegador y en este ordenador (o móvil)**. No se envía nada a ningún sitio.
- Si cambias de ordenador, de navegador o borras los datos del navegador, **los datos no te acompañan**.
- Por eso conviene hacer una **copia de seguridad** con regularidad (por ejemplo, cada viernes):
  1. Entra en **Datos**.
  2. Pulsa **Generar copia de seguridad**.
  3. Pulsa **Copiar al portapapeles**.
  4. Pega ese texto en un lugar seguro (un correo a ti misma, un bloc de notas…).
- Para recuperarla: en **Datos**, pega el texto en «Texto de la copia» y pulsa **Importar**. Sustituye todo lo que hubiera.

---

## 2. Primer día: comprobar lo básico

Arriba verás las secciones: Cuadrante, Personas, Puestos, Reglas, Rotación, Incidencias y Datos.

### Puestos

- Revisa que estén todas las áreas y puestos, con sus plazas y sus horarios (franjas).
- Comprueba el **corte mañana/tarde** (arriba de la lista).
- Si algún puesto solo existe en unas fechas, mira la vigencia (apartado 4.7).

### Personas

- Cada persona aparece con su código (EMP-01, EMP-02…).
- Revisa el **equipo** (mañana, tarde o ambos), las **habilitaciones** y las **restricciones**.
- Las personas inactivas no se tienen en cuenta.

### Reglas

- Al principio las reglas vienen como **«Pendiente de validar»**: son lo que se ha observado en tu Excel, pero aún no las has confirmado.
- Abre cada regla de la lista, léela y ajústala si hace falta.
- Si estás de acuerdo, pulsa **Validar**. Si no la quieres, **Descartar regla**.
- Si estás de acuerdo con todas, pulsa **Validar todas**.
- Las reglas **obligatorias** no admiten excepciones. Las **preferibles** se intentan cumplir.

---

## 3. La semana normal, paso a paso

### Pasos

1. Importa el horario de la semana que te han pasado (justo debajo, «Importar el horario de la plantilla»). Si lo guardas y pulsas **Ir a la semana**, ya estarás en el Cuadrante de esa semana.
2. Abre **Cuadrante** y elige la semana con **Semana anterior**, **Esta semana**, **Semana siguiente** o «Ir a la semana de».
3. Pulsa **Generar semana** (más abajo, los modos).
4. Revisa el resultado y pulsa **Aplicar**.
5. Mira el semáforo y corrige lo que haga falta.
6. Copia a Excel (apartado 6).

### Importar el horario de la plantilla

El horario dice quién trabaja cada día y a qué horas; el cuadrante reparte después a esas personas entre los puestos. Si una semana no tiene horario, la aplicación puede asignar a cualquiera a cualquier hora (el Cuadrante te lo recuerda con un aviso y un botón **Importar horario**).

1. Abre **Datos**: la primera tarjeta es **Horario de la plantilla**.
2. Elige la semana con **Semana anterior**, **Semana siguiente** o el campo de fecha. Por defecto sale la semana siguiente a hoy.
3. En Excel, selecciona la tabla (los códigos y los días), cópiala con Ctrl+C y pégala en «Pega aquí el horario copiado de Excel».
4. Pulsa **Leer horario**. Verás una tabla persona por día con lo que se ha entendido (por ejemplo «10:00–15:45», «Libra») y, en rojo y con texto, las casillas que no se entienden.
5. Si salen códigos que no existen, pulsa **Crear las N personas que faltan** (se crean sin habilitaciones; complétalas después en Personas).
6. Corrige en Excel lo que haya dado error y vuelve a pegar. Mientras haya errores no se puede guardar. Los avisos (por ejemplo, personas activas que no figuran en el horario) no bloquean.
7. Pulsa **Guardar horario de la semana**. Se te explicará el efecto (si reemplaza un horario anterior, si hay asignaciones que quedan fuera de turno…) y confirmas.
8. Pulsa **Ir a la semana** para abrir el Cuadrante de esa semana.

**Qué se puede escribir en cada casilla**

- Una hora de entrada y de salida: `10:00-15:45`, `10-15:45`, `10.00 a 15.45`, `10h-15:45h`.
- Turno partido: `10-14 y 17-21`, `10:00-14:00 / 17:00-21:00` o `10-14, 17-21`.
- Una letra de turno: `M` (mañana) o `T` (tarde), también `mañana` o `tarde`; `M+T` junta los dos.
- Libra: casilla vacía, `L`, `libre`, `descanso`, `fiesta`, `vacaciones`, `baja` o `-`. No se guarda el motivo.
- Cualquier otra cosa se marca como error.

Las letras se pueden cambiar o ampliar en **Turnos por letra** (letra, nombre y horas de cada turno, con **Añadir turno**). Esos ajustes solo valen mientras no cierres esa sección.

Con la fila de cabecera (Lun, Mar… o fechas) las columnas se reconocen por nombre; si no hay cabecera, se toman siete columnas seguidas después de la de códigos, de lunes a domingo. Si un código sale repetido, vale la última fila.

**Ver, corregir y quitar horarios guardados.** Más abajo, **Semanas con horario** lista cada semana con sus personas y horas. **Ver y editar** abre una rejilla con una casilla por persona y día, con los mismos formatos de arriba; **Guardar cambios** los aplica y **Descartar cambios** los olvida. **Quitar** borra el horario de esa semana (con confirmación y se puede deshacer).

**Qué cambia en el Cuadrante.** Cada persona solo se asigna dentro de su turno; quien no figura en el horario no trabaja esa semana. En la vista **Por persona** ves el turno de cada día, y el resumen **Por persona** muestra las horas de turno junto a las asignadas.

### Los tres modos de Generar semana

- **Partir de la semana tipo y cubrir huecos afectados.** Copia tu semana tipo y solo rehace lo que ya no encaja (ausencias, cierres). **Es el recomendado** cuando ya tienes semanas tipo.
- **Completar huecos sin tocar lo asignado.** Respeta todo lo que ya está puesto y rellena lo vacío. Úsalo después de retoques manuales.
- **Generar desde cero (respeta candados).** Empieza con la semana vacía, salvo lo que tenga candado. Úsalo la primera vez o si quieres rehacerlo todo.

Pulsa **Empezar**. Verás una barra de progreso. Al terminar aparece el resumen: cobertura, huecos sin cubrir y avisos.

- **Aplicar** pone el resultado en la semana.
- **Descartar** lo tira sin cambiar nada.
- **Probar otra variante** da otra propuesta distinta.

### El semáforo

Siempre va con texto, no solo con color:

- **Verde: «Todo correcto».** No hay nada que corregir.
- **Ámbar: «Solo preferencias sin cumplir».** Es válido, pero hay cosas mejorables.
- **Rojo: «incumplimientos obligatorios».** Hay algo que no se puede aceptar, como un solape o una persona de baja.

Pulsa **Ver incumplimientos** para ir a la lista. Cada aviso dice la persona, el día y la hora. Puedes filtrar por **Todos**, **Obligatorios** o **Preferencias**.

### Corregir a mano

1. Pulsa una casilla de la rejilla.
2. Se abre el editor del hueco. En «Persona» verás quién puede ir. Las que tienen un «no permitido» o un «preferible» llevan el motivo entre paréntesis.
3. Elige a la persona y pulsa **Asignar**.
4. **Quitar** deja el hueco vacío.
5. Si el hueco es parte de un bloque, marca **Aplicar a todo el bloque** para cambiar todo el bloque a la vez.
6. Pulsa **Cerrar** al terminar.

### Candados

- Dentro del editor, **Bloquear** pone un candado a esa asignación.
- El generador **no toca** lo que tiene candado.
- Una asignación bloqueada no se puede cambiar ni quitar hasta que pulses **Desbloquear**.
- Úsalos para fijar lo que ya está acordado antes de volver a generar.

### Comidas

- Debajo de cada día hay un apartado **Comidas**.
- Pulsa **Añadir comida**, elige a la persona, la hora («Desde» y «Hasta») y pulsa **Añadir**.
- Cada comida se puede bloquear o quitar.
- Una comida sin turno ese día se marca como «Comida sin turno».

### Vistas del cuadrante

- Hay una pestaña por área y una pestaña **Por persona**: elige a una persona y verás su semana.
- Debajo del cuadrante, el panel de validación tiene los resúmenes **Por persona** (horas, días, desviación) y **Cobertura por puesto**.

### Deshacer y rehacer

- Arriba a la derecha: **Deshacer** y **Rehacer**. También valen Ctrl+Z y Ctrl+Y.
- Al pasar el ratón sobre el botón verás qué acción deshará.
- **Vaciar semana** quita las asignaciones de la semana (puedes respetar los candados) y también se puede deshacer.

---

## 4. Recetas rápidas para imprevistos

### 4.1 Alguien se pone mala hoy

1. Ve a **Incidencias** y pulsa **Nueva ausencia**.
2. Elige la persona (por ejemplo, EMP-07). «Desde» y «Hasta» son hoy; deja marcado **Todo el día**.
3. Guarda. Verás cuántas asignaciones afecta.
4. Pulsa **Ir a la semana y recubrir**: se abre el Cuadrante y el generador busca sustituto solo para esos huecos.
5. Revisa el resumen, pulsa **Aplicar** y mira el semáforo.

Si prefieres hacerlo antes a mano, pulsa **Quitar las afectadas** y rellena tú.

### 4.2 Baja de varias semanas

1. En **Incidencias**, **Nueva ausencia**.
2. Pon «Desde» el primer día y «Hasta (inclusive)» el último previsto.
3. Guarda y pulsa **Quitar las afectadas** (un solo paso de deshacer).
4. Recubre semana a semana con **Ir a la semana y recubrir**.
5. Si la baja se alarga, **Editar** la incidencia y cambia «Hasta».

### 4.3 Ausencia solo unas horas

1. **Nueva ausencia**, elige la persona y el día.
2. Desmarca **Todo el día** y rellena «Desde la hora» y la hora final.
3. Guarda: solo se afectan las asignaciones que se solapan con ese tramo.
4. **Ir a la semana y recubrir** y pulsa **Aplicar**.

### 4.4 Persona nueva o de campaña (alta y baja)

1. En **Personas**, pulsa **Añadir persona**.
2. Pon su código (EMP-30, por ejemplo), el equipo y las habilitaciones.
3. Rellena **Alta** con su primer día y, si ya lo sabes, **Baja** con el último.
4. Pulsa **Guardar cambios**.
5. Genera la semana en modo «Completar huecos» para que la tenga en cuenta.

### 4.5 Alguien deja la empresa

1. En **Personas**, abre su ficha.
2. Pon su fecha de **Baja**.
3. **Guardar cambios** (la aplicación te explica el efecto antes de aplicar).
4. Recubre las semanas afectadas.

Mejor no borrar a la persona: si la desactivas o le pones fecha de baja, conservas el historial. **Borrar** solo si fue un error.

### 4.6 Caja nueva

1. En **Puestos**, busca el área y pulsa **Añadir puesto**.
2. Pon el nombre (Caja 3), las plazas y los días.
3. Define el horario (franjas). Si la tienes parecida a otra, usa **Duplicar puesto**.
4. **Guardar cambios**.
5. Genera la semana en modo «Completar huecos».

### 4.7 Temporada alta: una caja solo unas fechas (vigencia)

1. Crea el puesto como en la receta anterior.
2. En su ficha busca el grupo **Vigencia (para puestos de temporada)**.
3. Rellena **Existe desde** y **Existe hasta** con las fechas de la campaña.
4. Si dejas las dos vacías, el puesto existe **siempre**. Si dejas solo una, no hay límite por ese lado.
5. **Guardar cambios**. Fuera de esas fechas el puesto no aparece ni hace falta cubrirlo.

### 4.8 Cerrar un puesto unos días

1. En **Incidencias**, pulsa **Nuevo cierre de puesto**.
2. Elige el puesto, «Desde» y «Hasta (inclusive)».
3. Guarda y pulsa **Quitar las afectadas**.
4. En el Cuadrante verás «Puesto cerrado este día».

### 4.9 Cubrir otra zona

1. En **Puestos**, pulsa **Añadir área** (nombre, planta, color, icono).
2. Dentro del área, **Añadir puesto** con sus franjas.
3. En **Personas**, abre la ficha de quien podrá ir y marca la zona en **Habilitaciones**. Guarda.
4. Si el puesto lo exige, marca **Requiere habilitación**.
5. Verás la nueva pestaña de área en el Cuadrante.

---

## 5. Rotación y semanas tipo

### Qué son

- Tus semanas se repiten en ciclo: semana A, semana B, etc.
- Una **semana tipo** es un cuadrante base que guardas para cada semana del ciclo.
- Así, al generar, la aplicación parte de la semana tipo que toca.

### Configurar el ciclo

1. Entra en **Rotación**.
2. Indica las «Semanas del ciclo» (1 significa que no hay rotación).
3. En «Lunes de la semana A» pon un lunes que sea la primera semana del ciclo.
4. Cambia las etiquetas si quieres. Pulsa **Guardar cambios**.
5. El calendario de las próximas semanas te dice cuál es A y cuál B.

### Guardar una semana buena como semana tipo

1. Deja la semana bien en el Cuadrante.
2. Ve a **Rotación**, apartado **Guardar una semana como semana tipo**.
3. Elige la semana con **Semana anterior** y **Semana siguiente**.
4. En «Guardar como semana del ciclo» elige A, B…, ponle nombre y pulsa **Guardar semana tipo**.
5. Se avisa de lo que reemplazará.

### Usarla después

- En el Cuadrante, pulsa **Generar semana** y elige **Partir de la semana tipo y cubrir huecos afectados**.
- Si no hay semana tipo para esa letra, ese modo aparece desactivado.

### Patrones por persona

- Sirven para quien cambia de equipo o libra días distintos según la semana.
- En «Patrones por persona» pulsa **Añadir patrón**, elige a la persona y, por cada semana del ciclo, indica el equipo y los **días libres**.
- **Editar** y **Quitar** los modifican.

---

## 6. Pasar a Excel

1. En el Cuadrante, pulsa **Copiar para Excel**.
2. Elige el formato:
   - **Por área**: una tabla por área (elige el «Área» y la disposición: días en columnas o franjas en columnas).
   - **Por persona**: el horario semanal de cada persona.
   - **Listado completo**: una fila por asignación, como una base de datos.
3. La casilla **Exportar sin alias** viene marcada: sale solo el código. Desmárcala si quieres ver también el alias.
4. Mira la vista previa y pulsa **Copiar**.
5. En Excel, haz clic en una celda y pulsa **Ctrl+V**.

Si no sale nada, la semana está vacía en ese formato.

---

## 7. En el móvil

- Funciona todo, pero es más cómodo en ordenador para editar.
- Las secciones se desplazan de lado en la barra de arriba.
- **Gira el móvil** para ver mejor la rejilla del cuadrante.
- La rejilla se desplaza **dentro de su caja**: arrastra con el dedo dentro de ella.
- Las fichas se muestran en una sola columna.
- Los datos del móvil son distintos de los del ordenador. Usa la copia de seguridad para pasar de uno a otro.

---

## 8. Privacidad

- Las personas se identifican **solo con códigos EMP-xx**. No escribas nombres reales.
- El **alias** es opcional. Solo vive en este navegador. Si lo escribes, usa algo que solo tú entiendas.
- En la copia de seguridad, marca **Exportar sin alias** si no quieres que viaje.
- En las **notas** de restricciones e incidencias **nunca escribas motivos** (salud, familia, permisos…). Solo lo necesario para planificar: «no puede los jueves».
- Nada sale del navegador: la aplicación no usa Internet.

---

## 9. Preguntas frecuentes

**¿Por qué el semáforo está rojo?**
Hay algo obligatorio sin cumplir. Pulsa **Ver incumplimientos** y sigue el primer aviso.

**El generador deja huecos sin cubrir. ¿Es un fallo?**
No. Si nadie puede ir, lo deja vacío y te explica por qué en «Huecos sin cubrir» (y «Por qué no puede cada persona»). Puedes relajar una restricción o asignarlo a mano.

**¿Puedo volver atrás tras generar?**
Sí. Antes de pulsar **Aplicar**, usa **Descartar**. Después, **Deshacer**.

**No me deja asignar a alguien.**
En el editor, esa persona aparece con «no permitido» y el motivo. Elige otra o cambia la restricción en Personas.

**¿Qué diferencia hay entre «obligatoria» y «preferible»?**
Obligatoria: nunca se incumple. Preferible: se intenta, pero puede no cumplirse.

**¿Qué pasa si cierro el navegador?**
Nada: los datos siguen guardados en ese navegador.

**¿Dónde veo las horas de cada persona?**
Debajo del cuadrante, en el resumen **Por persona**.

**Cambié un horario y han desaparecido asignaciones.**
Aparecen en «Asignaciones fuera del horario». Pulsa **Quitar** o corrige el horario.

---

## 10. Si algo va mal

- **Me he equivocado:** pulsa **Deshacer** (o Ctrl+Z) tantas veces como haga falta.
- **Sale un aviso rojo «No se están guardando los cambios»:** el navegador no deja guardar. Ve a **Datos**, genera la copia de seguridad y guárdala ya.
- **Los datos parecen perdidos:** comprueba que usas el mismo navegador y ordenador de siempre. Si tienes una copia, impórtala en **Datos**.
- **Aparece «Datos no legibles»:** pulsa **Copiar datos no legibles** y envíalos a quien te dé soporte. No se borran.
- **Quiero practicar sin miedo:** en **Datos**, **Cargar datos de ejemplo** carga una planta ficticia (sustituye lo actual, así que haz antes una copia).
