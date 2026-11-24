// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { estadoConAsignaciones } from '../../../tests/ayudas/datosPrueba';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import type { EstadoApp } from '../../modelo/tipos';
import { crearAlmacenApp } from '../estado';
import { Rotacion } from './Rotacion';

async function montar(estado: EstadoApp = estadoConAsignaciones(), lunes = '2026-11-23') {
  const almacen = crearAlmacenApp(estado, { guardar: () => ({ ok: true }) });
  const raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(() => render(<Rotacion almacen={almacen} lunesVisible={lunes} />, raiz));
  return { almacen, raiz };
}

const boton = (raiz: HTMLElement, texto: string | RegExp, ultimo = false): HTMLButtonElement => {
  const todos = [...raiz.querySelectorAll('button')];
  const b = (ultimo ? todos.reverse() : todos).find((x) => {
    const t = (x.textContent ?? '').trim();
    const a = x.getAttribute('aria-label') ?? '';
    return typeof texto === 'string' ? t === texto || a === texto : texto.test(t) || texto.test(a);
  });
  if (!b) throw new Error(`No hay botón «${String(texto)}»`);
  return b;
};
const pulsar = (raiz: HTMLElement, texto: string | RegExp) => act(() => boton(raiz, texto).click());
const confirmar = (raiz: HTMLElement, texto: string) => act(() => boton(raiz, texto, true).click());
const campo = (raiz: HTMLElement, id: string) => raiz.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
async function escribir(el: HTMLInputElement | HTMLSelectElement, valor: string, evento = 'input') {
  await act(() => {
    el.value = valor;
    el.dispatchEvent(new Event(evento, { bubbles: true }));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Rotacion', () => {
  it('muestra el ciclo, el calendario y la semana tipo guardada', async () => {
    const { raiz } = await montar();
    expect(raiz.textContent).toContain('Ciclo de rotación');
    expect(raiz.querySelectorAll('.rotacion-tabla')[0]?.querySelectorAll('tbody tr')).toHaveLength(8);
    expect(raiz.textContent).toContain('Próximas 8 semanas');
    expect(boton(raiz, 'Guardar cambios').disabled).toBe(true);
  });

  it('cambiar el ciclo pide confirmar si borra semanas tipo y se puede deshacer', async () => {
    const e = estadoConAsignaciones();
    const { almacen, raiz } = await montar({ ...e, semanasTipo: [{ id: 's1', indiceCiclo: 1, nombre: 'Semana B', asignaciones: [] }] });
    await escribir(campo(raiz, 'rot-longitud'), '1');
    expect(campo(raiz, 'rot-etiqueta-0').value).toBe('A');
    await act(() => boton(raiz, 'Guardar cambios').click());
    expect(raiz.querySelector('[role="alertdialog"]')?.textContent).toContain('Se borrará la semana tipo B');
    expect(almacen.obtener().rotacion.longitudCiclo).toBe(2);
    await confirmar(raiz, 'Guardar rotación');
    expect(almacen.obtener().rotacion.longitudCiclo).toBe(1);
    expect(almacen.obtener().semanasTipo).toEqual([]);
    expect(almacen.descripcionDeshacer()).toBe('Cambiar la rotación');
  });

  it('descarta cambios y avisa de etiquetas repetidas', async () => {
    const { almacen, raiz } = await montar();
    await escribir(campo(raiz, 'rot-etiqueta-1'), 'A');
    expect(raiz.textContent).toContain('La etiqueta «A» está repetida');
    expect(boton(raiz, 'Guardar cambios').disabled).toBe(true);
    await pulsar(raiz, 'Descartar cambios');
    expect(campo(raiz, 'rot-etiqueta-1').value).toBe('B');
    expect(almacen.obtener().rotacion.etiquetas).toEqual(['A', 'B']);
  });

  it('guarda la semana visible como semana tipo con confirmación', async () => {
    const { almacen, raiz } = await montar();
    expect(campo(raiz, 'rot-tipo-indice').value).toBe('0');
    expect(raiz.textContent).toContain('Reemplazará la semana tipo A (2 asignaciones) por otra de 4 asignaciones');
    await pulsar(raiz, /^Guardar la semana del 23\/11\/2026 como semana tipo A$/);
    await confirmar(raiz, 'Guardar semana tipo');
    const tipo = almacen.obtener().semanasTipo;
    expect(tipo.find((s) => s.indiceCiclo === 0)?.asignaciones).toHaveLength(4);
  });

  it('cambia de semana, sugiere su letra y bloquea si está vacía', async () => {
    const { raiz } = await montar(crearEstadoEjemplo());
    expect(boton(raiz, /^Guardar la semana del/).disabled).toBe(true);
    await pulsar(raiz, 'Semana siguiente');
    expect(raiz.textContent).toContain('Semana del 30/11/2026 al 06/12/2026');
    expect(campo(raiz, 'rot-tipo-indice').value).toBe('1');
    expect(raiz.textContent).toContain('no tiene asignaciones válidas');
  });

  it('renombra y borra una semana tipo', async () => {
    const e = estadoConAsignaciones();
    const { almacen, raiz } = await montar({ ...e, semanasTipo: [{ id: 's1', indiceCiclo: 0, nombre: 'Normal', asignaciones: [] }] });
    await escribir(campo(raiz, 'rot-tipo-nombre-s1'), 'Verano');
    await pulsar(raiz, 'Renombrar la semana tipo A');
    expect(almacen.obtener().semanasTipo[0]?.nombre).toBe('Verano');
    await pulsar(raiz, 'Borrar la semana tipo A');
    await confirmar(raiz, 'Borrar');
    expect(almacen.obtener().semanasTipo).toEqual([]);
  });

  it('al cambiar la longitud del ciclo se cierra el borrador del patrón', async () => {
    const { almacen, raiz } = await montar();
    await escribir(campo(raiz, 'rot-patron-persona'), 'per-07', 'change');
    await pulsar(raiz, 'Añadir patrón');
    expect(campo(raiz, 'rot-patron-equipo-1')).not.toBeNull();
    await act(() => almacen.aplicar('Cambiar ciclo', (e) => ({ ...e, rotacion: { ...e.rotacion, longitudCiclo: 1, etiquetas: ['A'] } })));
    expect(raiz.querySelector('.rotacion-editor')).toBeNull();
  });

  it('añade, edita y quita un patrón por persona', async () => {
    const { almacen, raiz } = await montar();
    await escribir(campo(raiz, 'rot-patron-persona'), 'per-07', 'change');
    await pulsar(raiz, 'Añadir patrón');
    expect(boton(raiz, 'Guardar cambios', true).disabled).toBe(true);
    await escribir(campo(raiz, 'rot-patron-equipo-1'), 'T', 'change');
    await act(() => campo(raiz, 'rot-patron-libres-1-5').click());
    await act(() => boton(raiz, 'Guardar cambios', true).click());
    const p = almacen.obtener().personas.find((x) => x.id === 'per-07')!;
    expect(p.patron).toEqual([{ indiceCiclo: 1, equipo: 'T', diasLibres: [5] }]);
    expect([...raiz.querySelectorAll('.rotacion-tabla')].at(-1)?.textContent).toContain('Tarde, libra sáb');
    await pulsar(raiz, 'Quitar el patrón de EMP-07');
    await confirmar(raiz, 'Quitar patrón');
    expect(almacen.obtener().personas.find((x) => x.id === 'per-07')?.patron).toEqual([]);
  });
});
