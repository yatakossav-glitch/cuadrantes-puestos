// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { crearAlmacenApp } from '../estado';
import { Datos } from './Datos';

describe('Datos', () => {
  it('generar la copia rellena el área y un cambio la invalida', async () => {
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
    const raiz = document.createElement('div');
    document.body.appendChild(raiz);
    await act(() => render(<Datos almacen={almacen} />, raiz));
    const boton = [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes('Generar'))!;
    await act(async () => {
      boton.click();
      await new Promise((r) => setTimeout(r, 200));
    });
    const area = raiz.querySelector<HTMLTextAreaElement>('textarea[readonly]')!;
    expect(area.value.startsWith('CUADRANTES1.')).toBe(true);
    await act(() => almacen.aplicar('x', (e) => ({ ...e })));
    expect(raiz.querySelector<HTMLTextAreaElement>('textarea[readonly]')!.value).toBe('');
  });

  it('muestra el horario de la plantilla como primera tarjeta', async () => {
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
    const raiz = document.createElement('div');
    document.body.appendChild(raiz);
    await act(() => render(<Datos almacen={almacen} alIrASemana={() => {}} />, raiz));
    expect(raiz.querySelector('section.tarjeta h3')?.textContent).toBe('Horario de la plantilla');
  });

  it('una petición desde el Cuadrante pone la semana vista y enfoca el título del horario', async () => {
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
    const raiz = document.createElement('div');
    document.body.appendChild(raiz);
    await act(() => render(<Datos almacen={almacen} peticionHorario={null} />, raiz));
    await act(() => render(<Datos almacen={almacen} peticionHorario={{ lunes: '2026-12-14', nonce: 1 }} />, raiz));
    expect(document.activeElement?.id).toBe('titulo-horario');
    expect(raiz.textContent).toContain('Semana del 14/12/2026 al 20/12/2026');
  });
});
