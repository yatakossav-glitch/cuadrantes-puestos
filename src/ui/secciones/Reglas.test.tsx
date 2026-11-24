// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { crearAlmacenApp } from '../estado';
import type { AlmacenApp } from '../estado';
import { Reglas } from './Reglas';

let raiz: HTMLDivElement;
let almacen: AlmacenApp;

async function montar() {
  almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
  raiz = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(raiz);
  await act(() => render(<Reglas almacen={almacen} />, raiz));
}

const boton = (texto: string) => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;
const pulsar = (el: Element) => act(() => (el as HTMLElement).click());
const abrir = (nombre: string) => pulsar([...raiz.querySelectorAll('button.regla-nombre')].find((b) => b.textContent === nombre)!);
async function escribir(el: HTMLInputElement, valor: string) {
  await act(() => {
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() => {
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  });
}
const regla = (id: string) => almacen.obtener().reglas.find((r) => r.id === id)!;

describe('Reglas', () => {
  beforeEach(montar);

  it('avisa de las 15 pendientes y Validar todas las deja validadas, con deshacer', async () => {
    expect(raiz.querySelector('.reglas-banda')!.textContent).toContain('Hay 15 reglas pendientes de validar');
    await pulsar(boton('Validar todas'));
    await pulsar(boton('Sí, validar todas'));
    expect(almacen.obtener().reglas.every((r) => r.estado === 'validada')).toBe(true);
    expect(raiz.querySelector('.reglas-banda')).toBeNull();
    expect(almacen.descripcionDeshacer()).toBe('Validar todas las reglas');
    await act(() => almacen.deshacer());
    expect(raiz.querySelector('.reglas-banda')!.textContent).toContain('15 reglas');
  });

  it('cambiar el máximo a 5h y guardar actualiza la descripción; se deshace', async () => {
    await abrir('Máximo 4h30 al día');
    expect(raiz.textContent).toContain('4h30');
    await escribir(raiz.querySelector<HTMLInputElement>('#regla-regla-max-horas-dia-maxMin')!, '5h');
    await pulsar(boton('Guardar cambios'));
    expect(almacen.descripcionDeshacer()).toBe('Editar regla «Máximo 4h30 al día»');
    expect(raiz.textContent).toContain('Máximo 5h al día');
    await act(() => almacen.deshacer());
    expect(raiz.textContent).toContain('Máximo 4h30 al día');
  });

  it('un parámetro inválido bloquea Guardar', async () => {
    await abrir('Máximo 4h30 al día');
    await escribir(raiz.querySelector<HTMLInputElement>('#regla-regla-max-horas-dia-maxMin')!, '30h');
    expect(boton('Guardar cambios').disabled).toBe(true);
    expect(raiz.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('descarta los cambios del borrador sin tocar los datos', async () => {
    await abrir('Máximo 4h30 al día');
    await escribir(raiz.querySelector<HTMLInputElement>('#regla-nombre')!, 'Otro nombre');
    await pulsar(boton('Descartar cambios'));
    expect(raiz.querySelector<HTMLInputElement>('#regla-nombre')!.value).toBe('Máximo 4h30 al día');
    expect(almacen.puedeDeshacer()).toBe(false);
  });

  it('añade una regla de un tipo del catálogo y abre su ficha', async () => {
    const antes = almacen.obtener().reglas.length;
    await pulsar(boton('Añadir regla'));
    const sel = raiz.querySelector<HTMLSelectElement>('#regla-tipo-nuevo')!;
    expect(sel.options.length).toBe(15);
    await act(() => {
      sel.value = 'descansoEntreJornadas';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pulsar(boton('Crear regla de este tipo'));
    const reglas = almacen.obtener().reglas;
    expect(reglas.length).toBe(antes + 1);
    const nueva = reglas[reglas.length - 1]!;
    expect(nueva.tipo).toBe('descansoEntreJornadas');
    expect(nueva.estado).toBe('validada');
    expect(raiz.querySelector<HTMLInputElement>('#regla-nombre')!.value).toBe(nueva.nombre);
    await act(() => almacen.deshacer());
    expect(almacen.obtener().reglas.length).toBe(antes);
  });

  it('descarta una regla, la muestra atenuada y se puede deshacer', async () => {
    await abrir('Máximo 4h30 al día');
    await pulsar(boton('Descartar regla'));
    expect(regla('regla-max-horas-dia').estado).toBe('descartada');
    expect(almacen.descripcionDeshacer()).toBe('Descartar regla «Máximo 4h30 al día»');
    expect(raiz.querySelector('.regla-fila.descartada')!.textContent).toContain('Descartada: no se aplica');
    await pulsar(boton('Volver a pendiente'));
    expect(regla('regla-max-horas-dia').estado).toBe('pendiente');
    await act(() => almacen.deshacer());
    await act(() => almacen.deshacer());
    expect(regla('regla-max-horas-dia').estado).toBe('pendiente');
  });

  it('desactiva desde la lista al momento y se deshace', async () => {
    const casilla = raiz.querySelector<HTMLInputElement>('#regla-activa-regla-max-horas-dia')!;
    await pulsar(casilla);
    expect(regla('regla-max-horas-dia').activa).toBe(false);
    await act(() => almacen.deshacer());
    expect(regla('regla-max-horas-dia').activa).toBe(true);
  });

  it('borra con confirmación y se deshace', async () => {
    const antes = almacen.obtener().reglas.length;
    await abrir('Máximo 4h30 al día');
    await pulsar(boton('Borrar'));
    expect(almacen.obtener().reglas.length).toBe(antes);
    await pulsar(boton('Sí, borrar regla'));
    expect(almacen.obtener().reglas.length).toBe(antes - 1);
    await act(() => almacen.deshacer());
    expect(almacen.obtener().reglas.length).toBe(antes);
  });

  it('avisa antes de cambiar de regla con cambios sin guardar', async () => {
    await abrir('Máximo 4h30 al día');
    await escribir(raiz.querySelector<HTMLInputElement>('#regla-nombre')!, 'Otro nombre');
    await abrir('No repetir seguidas en LEGO');
    expect(raiz.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(raiz.querySelector<HTMLInputElement>('#regla-nombre')!.value).toBe('Otro nombre');
    await pulsar(boton('Cancelar'));
    expect(raiz.querySelector<HTMLInputElement>('#regla-nombre')!.value).toBe('Otro nombre');
    await abrir('No repetir seguidas en LEGO');
    await pulsar(boton('Sí, descartar y continuar'));
    expect(raiz.querySelector<HTMLInputElement>('#regla-nombre')!.value).toBe('No repetir seguidas en LEGO');
  });

  it('la casilla Activa de la fila aplica también al borrador sin perderlo', async () => {
    await abrir('Máximo 4h30 al día');
    await escribir(raiz.querySelector<HTMLInputElement>('#regla-nombre')!, 'Otro nombre');
    await pulsar(raiz.querySelector('#regla-activa-regla-max-horas-dia')!);
    expect(regla('regla-max-horas-dia').activa).toBe(false);
    expect(raiz.querySelector<HTMLInputElement>('#regla-nombre')!.value).toBe('Otro nombre');
    expect(raiz.querySelector<HTMLInputElement>('#regla-activa')!.checked).toBe(false);
    expect(boton('Guardar cambios').disabled).toBe(false);
  });

  it('deshacer con la regla abierta y cambios conserva el borrador y avisa', async () => {
    await pulsar(raiz.querySelector('#regla-activa-regla-max-horas-dia')!);
    await abrir('Máximo 4h30 al día');
    await escribir(raiz.querySelector<HTMLInputElement>('#regla-nombre')!, 'Otro nombre');
    await act(() => almacen.deshacer());
    expect(raiz.textContent).toContain('La regla ha cambiado mientras la editabas');
    expect(raiz.querySelector<HTMLInputElement>('#regla-nombre')!.value).toBe('Otro nombre');
    await pulsar(boton('Descartar el borrador'));
    expect(raiz.textContent).not.toContain('La regla ha cambiado mientras la editabas');
    expect(raiz.querySelector<HTMLInputElement>('#regla-nombre')!.value).toBe('Máximo 4h30 al día');
  });

  it('activar una regla sin puestos pide confirmación', async () => {
    const estado = crearEstadoEjemplo();
    estado.reglas = estado.reglas.map((r) =>
      r.id === 'regla-no-repetir-lego' && r.tipo === 'noRepetirConsecutivas'
        ? { ...r, activa: false, params: { ambito: { areaIds: [], puestoIds: [] } } }
        : r,
    );
    almacen = crearAlmacenApp(estado, { guardar: () => ({ ok: true }) });
    await act(() => render(<Reglas almacen={almacen} />, raiz));
    const casilla = raiz.querySelector<HTMLInputElement>('#regla-activa-regla-no-repetir-lego')!;
    await pulsar(casilla);
    expect(raiz.querySelector('[role="alertdialog"]')!.textContent).toContain('se aplicará a TODOS los puestos');
    expect(regla('regla-no-repetir-lego').activa).toBe(false);
    await pulsar(boton('Cancelar'));
    expect(regla('regla-no-repetir-lego').activa).toBe(false);
    await pulsar(raiz.querySelector('#regla-activa-regla-no-repetir-lego')!);
    await pulsar(boton('Activar igualmente'));
    expect(regla('regla-no-repetir-lego').activa).toBe(true);
  });

  it('usa el plural correcto al validar y explica qué hace descartar', async () => {
    const estado = crearEstadoEjemplo();
    estado.reglas = estado.reglas.map((r, i) => ({ ...r, estado: i === 0 ? 'pendiente' : 'validada' }));
    almacen = crearAlmacenApp(estado, { guardar: () => ({ ok: true }) });
    await act(() => render(<Reglas almacen={almacen} />, raiz));
    await pulsar(boton('Validar todas'));
    expect(raiz.querySelector('[role="alertdialog"]')!.textContent).toContain('1 regla validada');
    await pulsar(boton('Cancelar'));
    await abrir(estado.reglas[1]!.nombre);
    expect(raiz.textContent).toContain('No se aplicará, pero se conserva');
  });

  it('un valor que no se entiende bloquea Guardar con su motivo', async () => {
    await abrir('Máximo 4h30 al día');
    await escribir(raiz.querySelector<HTMLInputElement>('#regla-regla-max-horas-dia-maxMin')!, 'abc');
    expect(boton('Guardar cambios').disabled).toBe(true);
    expect(raiz.textContent).toContain('Hay un valor que no se entiende');
  });
});
