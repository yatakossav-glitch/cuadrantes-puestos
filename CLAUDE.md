# Cuadrantes de puestos · convenciones del proyecto

App web de un único `index.html` para hacer los cuadrantes semanales de cobertura de puestos.
Especificación: `docs/20261123_prompt_app-cuadrantes.md`. Diseño: `ARQUITECTURA.md`.

## Contratos: NO TOCAR sin permiso del director

- `src/modelo/tipos.ts` (modelo de datos)
- `src/modelo/esquema.ts` (persistencia versionada)
- `src/reglas/contrato.ts` (interfaz común de regla)
- `src/motor/contrato.ts` (API del motor)

Si una tarea parece exigir un cambio en ellos, para y explica qué cambio y por qué.

## Convenciones

- **Nombres en español** (variables, funciones, archivos, mensajes de commit). Interfaz en español de España.
- TypeScript estricto. Nada de `any`; usa `unknown` y estrecha.
- Horas en minutos desde las 00:00; intervalos `[inicio, fin)`; fechas `AAAA-MM-DD`; días 0 = lunes … 6 = domingo.
- Módulos de `modelo`, `edicion`, `reglas`, `validacion`, `motor`, `rotacion` y `exportar`: **funciones puras**, sin DOM ni almacenamiento.
- Un tipo de regla por archivo: `src/reglas/general/<tipo>.ts` o `src/reglas/persona/<tipo>.ts`, con su test al lado (`<tipo>.test.ts`).
- Mensajes de incumplimiento legibles para una usuaria no técnica, con código de persona, día y hora: «EMP-11 supera 4h30 el jueves (5h15)».
- **Privacidad:** solo códigos ficticios `EMP-xx` en datos y tests. Nunca nombres reales ni motivos de una restricción.
- **Sin red:** prohibido `fetch`, `XMLHttpRequest`, `WebSocket`, CDN, fuentes web o cualquier URL externa en el código final.
  Excepción conocida: Preact incluye los espacios de nombres XML `http://www.w3.org/...` (SVG, XHTML, MathML); no son peticiones y el test de red debe permitirlos.
- **Sin dependencias nuevas** sin permiso del director. En ejecución: solo `preact`. De desarrollo autorizadas: typescript, vite, vite-plugin-singlefile, vitest, jsdom, @preact/preset-vite y @types/node (solo tipos, para los tests).
- Los tests se comprueban con `tsconfig.tests.json`, que relaja `noUncheckedIndexedAccess` (en tests, un índice fuera de rango ya hace fallar la aserción). `src/` mantiene todo el rigor.
- Sin emojis en la interfaz ni en lo exportado.

## Comandos

- `npm test`: toda la batería (Vitest).
- `npx vitest run ruta/al/archivo.test.ts`: un solo archivo.
- `npm run tipos`: comprobación de tipos.
- `npm run build`: genera `dist/index.html` autocontenido.
- `npm run dev`: servidor de desarrollo.

Si `npm install` falla por permisos de la caché, añade `--cache` con una carpeta temporal.

## Git

Commits pequeños por tarea, en español, en imperativo: «Añade regla sinSolapes con tests».
