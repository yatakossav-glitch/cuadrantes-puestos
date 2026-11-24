// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { moverPuesto } from '../../edicion/puestos';
import { estadoConAsignaciones } from '../../../tests/ayudas/datosPrueba';
import type { EstadoApp } from '../../modelo/tipos';
import { crearAlmacenApp } from '../estado';
import { Puestos } from './Puestos';

async function montar(estado: EstadoApp = crearEstadoEjemplo()) {
  const almacen = crearAlmacenApp(estado, { guardar: () => ({ ok: true }) });
  const raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(() => render(<Puestos almacen={almacen} />, raiz));
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
/** Botón de confirmación: el último con ese texto (el diálogo va tras la ficha). */
const confirmar = (raiz: HTMLElement, texto: string) => act(() => boton(raiz, texto, true).click());
/** Selecciona el primer puesto de un área (algunos se llaman «Puesto único»). */
const elegirPuesto = (raiz: HTMLElement, area: string) =>
  act(() => {
    const bloque = [...raiz.querySelectorAll('.bloque-area')].find((x) => x.querySelector('.elemento .nombre')?.textContent === area);
    const b = bloque?.querySelector<HTMLButtonElement>('.puestos-de-area .elemento');
    if (!b) throw new Error(`No hay puesto en ${area}`);
    b.click();
  });
const marcar = (el: HTMLElement) => act(() => el.click());

async function escribir(input: HTMLInputElement, valor: string) {
  await act(() => {
    input.value = valor;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() => {
    input.dispatchEvent(new FocusEvent('blur'));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Puestos', () => {
  it('agrupa por planta y muestra áreas inactivas con texto', async () => {
    const { raiz } = await montar();
    expect(raiz.textContent).toContain('Planta 3');
    expect(raiz.textContent).toContain('Planta 4');
    expect(raiz.textContent).toContain('inactiva');
  });

  it('añade un área y se puede deshacer', async () => {
    const { almacen, raiz } = await montar();
    await pulsar(raiz, 'Añadir área');
    expect(almacen.obtener().areas).toHaveLength(5);
    expect(almacen.descripcionDeshacer()).toBe('Añadir área Área nueva');
    expect(raiz.querySelector<HTMLInputElement>('#area-nombre')!.value).toBe('Área nueva');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().areas).toHaveLength(4);
  });

  it('edita un área como borrador y guarda con descripción legible', async () => {
    const { almacen, raiz } = await montar();
    await pulsar(raiz, /^Librería/);
    const nombre = raiz.querySelector<HTMLInputElement>('#area-nombre')!;
    await act(() => {
      nombre.value = 'Papelería';
      nombre.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(almacen.obtener().areas.some((a) => a.nombre === 'Papelería')).toBe(false);
    await pulsar(raiz, 'Guardar cambios');
    expect(almacen.obtener().areas.some((a) => a.nombre === 'Papelería')).toBe(true);
    expect(almacen.descripcionDeshacer()).toBe('Editar Papelería');
  });

  it('no permite borrar un área con puestos y explica por qué', async () => {
    const { almacen, raiz } = await montar();
    await pulsar(raiz, /^Caja$/);
    await pulsar(raiz, 'Borrar área');
    expect(raiz.querySelector('[role="alertdialog"]')).toBeNull();
    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('Tiene 2 puestos');
    expect(almacen.obtener().areas.some((a) => a.id === IDS_EJEMPLO.areas.caja)).toBe(true);
  });

  it('borra un área vacía tras confirmar y se deshace', async () => {
    const { almacen, raiz } = await montar();
    await pulsar(raiz, /^Librería/);
    await pulsar(raiz, 'Borrar área');
    await confirmar(raiz, 'Borrar área');
    expect(almacen.obtener().areas).toHaveLength(3);
    expect(almacen.descripcionDeshacer()).toBe('Borrar área Librería');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().areas).toHaveLength(4);
  });

  it('añade una franja a Caja 1 y guarda', async () => {
    const { almacen, raiz } = await montar();
    await pulsar(raiz, /^Caja 1/);
    await pulsar(raiz, 'Añadir franja');
    expect(almacen.obtener().puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!.horario.general.franjas).toHaveLength(8);
    // 22:00–23:00 propuesta tras la última; no se solapa, se puede guardar.
    await pulsar(raiz, 'Guardar cambios');
    const caja1 = almacen.obtener().puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!;
    expect(caja1.horario.general.franjas).toHaveLength(9);
    expect(caja1.horario.general.franjas[8]).toMatchObject({ inicio: 1320, fin: 1380 });
    expect(almacen.descripcionDeshacer()).toBe('Editar Caja 1');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!.horario.general.franjas).toHaveLength(8);
  });

  it('crea un bloque con dos franjas consecutivas', async () => {
    const { almacen, raiz } = await montar();
    await elegirPuesto(raiz, 'Pedidos Web');
    const casillas = raiz.querySelectorAll<HTMLInputElement>('table tbody input[type="checkbox"]');
    await marcar(casillas[0]!);
    await marcar(casillas[1]!);
    await pulsar(raiz, 'Agrupar en bloque');
    await pulsar(raiz, 'Guardar cambios');
    const p = almacen.obtener().puestos.find((x) => x.id === IDS_EJEMPLO.puestos.pedidos)!;
    expect(p.horario.general.bloques).toHaveLength(1);
    expect(p.horario.general.bloques[0]!.franjaIds).toHaveLength(2);
  });

  it('muestra el motivo si las franjas no son consecutivas', async () => {
    const { almacen, raiz } = await montar();
    await elegirPuesto(raiz, 'Exposición LEGO');
    const casillas = raiz.querySelectorAll<HTMLInputElement>('table tbody input[type="checkbox"]');
    await marcar(casillas[0]!);
    await marcar(casillas[2]!);
    await pulsar(raiz, 'Agrupar en bloque');
    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('consecutivas');
    expect(raiz.querySelector('table tbody')!.textContent).not.toContain('10:00–11:55 ');
    expect(almacen.puedeDeshacer()).toBe(false);
  });

  it('separa un bloque existente', async () => {
    const { almacen, raiz } = await montar();
    await pulsar(raiz, /^Caja 1/);
    await marcar(raiz.querySelectorAll<HTMLInputElement>('table tbody input[type="checkbox"]')[0]!);
    await pulsar(raiz, 'Separar bloque');
    await pulsar(raiz, 'Guardar cambios');
    const p = almacen.obtener().puestos.find((x) => x.id === IDS_EJEMPLO.puestos.caja1)!;
    expect(p.horario.general.bloques).toHaveLength(3);
  });

  it('quitar el domingo con asignaciones avisa del impacto antes de guardar', async () => {
    const { almacen, raiz } = await montar(estadoConAsignaciones());
    await pulsar(raiz, /^Caja 1/);
    await marcar(raiz.querySelector<HTMLInputElement>('#puesto-dias-6')!);
    await pulsar(raiz, 'Guardar cambios');
    const dialogo = raiz.querySelector('[role="alertdialog"]')!;
    expect(dialogo.textContent).toMatch(/Se quitará 1 asignación/);
    // Aún no se ha aplicado.
    expect(almacen.obtener().cuadrantes['2026-11-30']!.asignaciones).toHaveLength(2);
    await confirmar(raiz, 'Guardar y aplicar');
    expect(almacen.obtener().cuadrantes['2026-11-30']!.asignaciones).toHaveLength(1);
    expect(almacen.obtener().puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!.dias).not.toContain(6);
    await act(() => almacen.deshacer());
    expect(almacen.obtener().cuadrantes['2026-11-30']!.asignaciones).toHaveLength(2);
  });

  it('personaliza un día y vuelve al horario general', async () => {
    const { raiz } = await montar();
    await elegirPuesto(raiz, 'Pedidos Web');
    const select = raiz.querySelector<HTMLSelectElement>('#horario-nuevo-dia')!;
    await act(() => {
      select.value = '6';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pulsar(raiz, 'Crear horario propio');
    expect(boton(raiz, 'Domingo').getAttribute('aria-pressed')).toBe('true');
    await pulsar(raiz, 'Volver al horario general');
    expect([...raiz.querySelectorAll('.pestana-dia')].map((t) => t.textContent)).toEqual(['Todos los días']);
  });

  it('cambia el corte mañana/tarde con descripción legible y se deshace', async () => {
    const { almacen, raiz } = await montar();
    expect(raiz.textContent).toContain('Una franja es de mañana si empieza antes de esta hora');
    await escribir(raiz.querySelector<HTMLInputElement>('#corte-manana-tarde')!, '15:30');
    expect(almacen.obtener().config.corteMananaTarde).toBe(930);
    expect(almacen.descripcionDeshacer()).toBe('Cambiar corte mañana/tarde a 15:30');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().config.corteMananaTarde).toBe(945);
  });

  it('mueve, duplica y borra puestos, con todo deshacible', async () => {
    const { almacen, raiz } = await montar();
    await pulsar(raiz, 'Bajar puesto Caja 1');
    expect(almacen.descripcionDeshacer()).toBe('Bajar puesto Caja 1');
    await pulsar(raiz, /^Caja 1/);
    await pulsar(raiz, 'Duplicar puesto');
    expect(almacen.obtener().puestos).toHaveLength(5);
    expect(almacen.descripcionDeshacer()).toBe('Duplicar puesto Caja 1');
    await pulsar(raiz, 'Borrar puesto');
    await confirmar(raiz, 'Borrar puesto');
    expect(almacen.obtener().puestos).toHaveLength(4);
    for (let i = 0; i < 3; i += 1) await act(() => almacen.deshacer());
    expect(almacen.obtener()).toEqual(crearEstadoEjemplo());
  });

  it('desactiva Guardar y lista los errores si hay un nombre vacío', async () => {
    const { raiz } = await montar();
    await pulsar(raiz, /^Caja 1/);
    const nombre = raiz.querySelector<HTMLInputElement>('#puesto-nombre')!;
    await act(() => {
      nombre.value = '';
      nombre.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(boton(raiz, 'Guardar cambios').disabled).toBe(true);
    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('Falta el nombre del puesto');
    await pulsar(raiz, 'Descartar cambios');
    expect(raiz.querySelector<HTMLInputElement>('#puesto-nombre')!.value).toBe('Caja 1');
  });

  it('guardar tras mover no pisa el orden y no repite órdenes', async () => {
    const { almacen, raiz } = await montar();
    await pulsar(raiz, /^Caja 1/);
    const nombre = raiz.querySelector<HTMLInputElement>('#puesto-nombre')!;
    await act(() => {
      nombre.value = 'Caja uno';
      nombre.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await pulsar(raiz, 'Bajar puesto Caja 1');
    expect(raiz.querySelector('[role="alertdialog"]')!.textContent).toContain('cambios sin guardar');
    await confirmar(raiz, 'Descartar cambios');
    expect(raiz.querySelector<HTMLInputElement>('#puesto-nombre')!.value).toBe('Caja 1');
    // Con la ficha limpia, edita y guarda tras otro movimiento externo.
    await act(() => almacen.aplicar('Mover', (e) => moverPuesto(e, IDS_EJEMPLO.puestos.caja1, -1)));
    await act(() => {
      const n = raiz.querySelector<HTMLInputElement>('#puesto-nombre')!;
      n.value = 'Caja uno';
      n.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => almacen.aplicar('Mover', (e) => moverPuesto(e, IDS_EJEMPLO.puestos.caja1, 1)));
    const ordenAntes = almacen.obtener().puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!.orden;
    await pulsar(raiz, 'Guardar cambios');
    const puestos = almacen.obtener().puestos.filter((p) => p.areaId === IDS_EJEMPLO.areas.caja);
    expect(puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!.orden).toBe(ordenAntes);
    expect(new Set(puestos.map((p) => p.orden)).size).toBe(puestos.length);
    expect(puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!.nombre).toBe('Caja uno');
  });

  it('cambiar de selección con cambios sin guardar pide confirmación', async () => {
    const { raiz } = await montar();
    await pulsar(raiz, /^Librería/);
    const nombre = raiz.querySelector<HTMLInputElement>('#area-nombre')!;
    await act(() => {
      nombre.value = 'Otra';
      nombre.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await pulsar(raiz, /^Caja$/);
    expect(raiz.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(raiz.querySelector<HTMLInputElement>('#area-nombre')!.value).toBe('Otra');
    await confirmar(raiz, 'Descartar cambios');
    expect(raiz.querySelector<HTMLInputElement>('#area-nombre')!.value).toBe('Caja');
  });

  it('una hora que no se entiende bloquea Guardar y explica el motivo', async () => {
    const { raiz } = await montar();
    await pulsar(raiz, /^Caja 1/);
    await marcar(raiz.querySelector<HTMLInputElement>('#puesto-activo')!);
    expect(boton(raiz, 'Guardar cambios').disabled).toBe(false);
    const hora = raiz.querySelector<HTMLInputElement>('[id^="franja-"][id$="-inicio"]')!;
    await act(() => {
      hora.value = 'xx';
      hora.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(boton(raiz, 'Guardar cambios').disabled).toBe(true);
    expect(raiz.textContent).toContain('Hay una hora que no se entiende');
  });
});
