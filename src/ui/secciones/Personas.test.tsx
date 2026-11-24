// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { estadoConAsignaciones } from '../../../tests/ayudas/datosPrueba';
import type { EstadoApp } from '../../modelo/tipos';
import { crearAlmacenApp } from '../estado';
import { Personas } from './Personas';

let raiz: HTMLElement;

async function montar(estado: EstadoApp = crearEstadoEjemplo()) {
  const almacen = crearAlmacenApp(estado, { guardar: () => ({ ok: true }) });
  raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(() => render(<Personas almacen={almacen} />, raiz));
  return almacen;
}

afterEach(() => {
  render(null, raiz);
  raiz.remove();
});

const boton = (texto: string) =>
  [...raiz.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto) as HTMLButtonElement;
const campo = (id: string) => raiz.querySelector<HTMLInputElement>(`#${id}`)!;

async function escribir(id: string, valor: string) {
  await act(() => {
    const el = campo(id);
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const pulsar = (el: HTMLElement) => act(() => el.click());
const abrir = (id: string) => pulsar(campo(`fila-${id}`));

describe('Personas', () => {
  it('crea una persona nueva, la selecciona y se puede deshacer', async () => {
    const almacen = await montar();
    await pulsar(boton('Añadir persona'));
    expect(almacen.obtener().personas.some((p) => p.codigo === 'EMP-30')).toBe(true);
    expect(raiz.textContent).toContain('EMP-30');
    expect(campo('persona-codigo').value).toBe('EMP-30');
    expect(document.activeElement).toBe(campo('persona-codigo'));
    expect(almacen.descripcionDeshacer()).toBe('Añadir EMP-30');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().personas.some((p) => p.codigo === 'EMP-30')).toBe(false);
  });

  it('un código casi duplicado bloquea Guardar y muestra el error', async () => {
    const almacen = await montar();
    await abrir('per-07');
    await escribir('persona-codigo', 'EMP-5');
    expect(raiz.textContent).toContain('El código EMP-5 coincide con EMP-05');
    expect(boton('Guardar cambios').disabled).toBe(true);
    await escribir('persona-codigo', 'EMP-07B');
    expect(boton('Guardar cambios').disabled).toBe(false);
    await pulsar(boton('Guardar cambios'));
    expect(almacen.obtener().personas.find((p) => p.id === 'per-07')?.codigo).toBe('EMP-07B');
    expect(almacen.descripcionDeshacer()).toBe('Editar EMP-07B');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().personas.find((p) => p.id === 'per-07')?.codigo).toBe('EMP-07');
  });

  it('añade una restricción «No trabaja…» y la guarda', async () => {
    const almacen = await montar();
    await abrir('per-03');
    const antes = almacen.obtener().personas.find((p) => p.id === 'per-03')!.restricciones.length;
    const selector = raiz.querySelector<HTMLSelectElement>('#persona-tipo-restriccion')!;
    await act(() => {
      selector.value = 'diasNoDisponibles';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pulsar(boton('Añadir restricción'));
    expect(raiz.textContent).toContain('No trabaja');
    await pulsar(boton('Guardar cambios'));
    const despues = almacen.obtener().personas.find((p) => p.id === 'per-03')!.restricciones;
    expect(despues.length).toBe(antes + 1);
    expect(despues.some((r) => r.tipo === 'diasNoDisponibles')).toBe(true);
    expect(almacen.descripcionDeshacer()).toBe('Editar EMP-03');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().personas.find((p) => p.id === 'per-03')!.restricciones.length).toBe(antes);
  });

  it('borrar pide confirmación con el impacto y se puede deshacer', async () => {
    const almacen = await montar(estadoConAsignaciones());
    await abrir('per-01');
    await pulsar(boton('Borrar'));
    const dialogo = raiz.querySelector('[role="alertdialog"]')!;
    expect(dialogo.textContent).toContain('asignaciones');
    expect(dialogo.textContent).toContain('incidencia');
    expect(almacen.obtener().personas.some((p) => p.id === 'per-01')).toBe(true);
    await pulsar([...dialogo.querySelectorAll('button')].find((b) => b.textContent === 'Borrar')!);
    expect(almacen.obtener().personas.some((p) => p.id === 'per-01')).toBe(false);
    expect(almacen.descripcionDeshacer()).toBe('Borrar EMP-01');
    expect(raiz.querySelector('[role="alertdialog"]')).toBeNull();
    await act(() => almacen.deshacer());
    expect(almacen.obtener().personas.some((p) => p.id === 'per-01')).toBe(true);
  });

  it('desactiva desde la lista al momento y se puede deshacer', async () => {
    const almacen = await montar();
    await pulsar(raiz.querySelector<HTMLInputElement>('input[aria-label="Activa EMP-07"]')!);
    expect(almacen.obtener().personas.find((p) => p.id === 'per-07')!.activa).toBe(false);
    expect(almacen.descripcionDeshacer()).toBe('Desactivar EMP-07');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().personas.find((p) => p.id === 'per-07')!.activa).toBe(true);
  });

  it('cambiar de persona con cambios sin guardar pide confirmación', async () => {
    const almacen = await montar();
    await abrir('per-02');
    await escribir('persona-alias', 'Prueba');
    await abrir('per-03');
    expect(raiz.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(campo('persona-alias').value).toBe('Prueba');
    await pulsar(boton('Descartar cambios'));
    expect(raiz.querySelector('h3')?.textContent).toContain('EMP-03');
    expect(almacen.obtener().personas.find((p) => p.id === 'per-02')!.alias).toBeNull();
  });

  it('el buscador filtra por código', async () => {
    await montar();
    await escribir('personas-buscar', 'emp-1');
    const filas = raiz.querySelectorAll('tbody tr');
    expect(filas.length).toBe(10);
  });

  it('quita del borrador las áreas borradas y no bloquea Guardar', async () => {
    const almacen = await montar();
    await abrir('per-02');
    await escribir('persona-alias', 'Prueba');
    const area = almacen.obtener().personas.find((p) => p.id === 'per-02')!.habilitaciones[0]!;
    await act(() => almacen.aplicar('Borrar área', (e) => ({ ...e, areas: e.areas.filter((a) => a.id !== area), puestos: e.puestos.filter((x) => x.areaId !== area) })));
    expect(raiz.textContent).toContain('Se han quitado de la ficha áreas o puestos que ya no existen');
    expect(raiz.querySelector(`input[type="checkbox"][value="${area}"]`)).toBeNull();
    expect(boton('Guardar cambios').disabled).toBe(false);
  });

  it('un texto de duración que no se entiende bloquea Guardar con su motivo', async () => {
    await montar();
    await abrir('per-02');
    await pulsar(raiz.querySelector<HTMLInputElement>('#persona-contrato-sindefinir')!);
    await escribir('persona-contrato', 'xyz');
    await act(() => {
      campo('persona-contrato').dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(boton('Guardar cambios').disabled).toBe(true);
    expect(raiz.textContent).toContain('Hay un valor que no se entiende');
  });
});
