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
});
