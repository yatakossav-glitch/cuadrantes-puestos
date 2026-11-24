// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estadoConAsignaciones } from '../../../tests/ayudas/datosPrueba';
import type { EstadoApp, FechaISO } from '../../modelo/tipos';
import { crearAlmacenApp } from '../estado';
import { Incidencias } from './Incidencias';

let raiz: HTMLElement;
const llamadas: [FechaISO, boolean][] = [];

async function montar(estado: EstadoApp = estadoConAsignaciones()) {
  const almacen = crearAlmacenApp(estado, { guardar: () => ({ ok: true }) });
  raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(() => render(<Incidencias almacen={almacen} alIrASemana={(l, r) => llamadas.push([l, r])} />, raiz));
  return almacen;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 24, 12, 0, 0)); // martes 24/11/2026
  llamadas.length = 0;
});
afterEach(() => {
  render(null, raiz);
  raiz.remove();
  vi.useRealTimers();
});

const boton = (texto: string) =>
  [...raiz.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === texto,
  ) as HTMLButtonElement;
const campo = (id: string) => raiz.querySelector<HTMLInputElement>(`#${id}`)!;
const pulsar = (el: HTMLElement) => act(() => el.click());
async function escribir(id: string, valor: string, evento = 'input') {
  await act(() => {
    const el = campo(id);
    el.value = valor;
    el.dispatchEvent(new Event(evento, { bubbles: true }));
  });
}

describe('Incidencias', () => {
  it('lista por defecto las en curso y próximas, con el momento en texto, y filtra', async () => {
    await montar();
    const texto = () => raiz.querySelector('.incidencias-lista')?.textContent ?? '';
    expect(texto()).toContain('EMP-01 ausente del lunes 23 nov al martes 24 nov');
    expect(texto()).toContain('En curso');
    expect(texto()).toContain('Próxima');
    expect(texto()).toContain('Afecta a 2 asignaciones');
    expect(texto()).not.toContain('EMP-02');
    await escribir('inc-filtro', 'pasadas', 'change');
    expect(texto()).toContain('EMP-02');
    expect(texto()).toContain('Pasada');
    await escribir('inc-filtro', 'todas', 'change');
    await escribir('inc-buscar', 'caja 1');
    expect(texto()).toContain('Caja 1 (Caja) cerrada');
    expect(texto()).not.toContain('EMP-01');
  });

  it('la ausencia nueva viene con hoy y se puede dar de baja a alguien en dos pasos', async () => {
    const almacen = await montar();
    await pulsar(boton('Nueva ausencia'));
    expect(campo('inc-desde').value).toBe('2026-11-24');
    expect(campo('inc-hasta').value).toBe('2026-11-24');
    await escribir('inc-persona', 'per-02', 'change');
    await pulsar(boton('Guardar cambios'));
    const nuevas = almacen.obtener().incidencias.filter((i) => i.tipo === 'ausencia' && i.personaId === 'per-02' && i.desde === '2026-11-24');
    expect(nuevas).toHaveLength(1);
    expect(raiz.textContent).toContain('Afecta a 1 asignación ya hecha en 1 semana');
    expect(almacen.descripcionDeshacer()).toBe('Añadir ausencia de EMP-02');
  });

  it('bloquea Guardar con fechas cruzadas y muestra los avisos sin bloquear', async () => {
    await montar();
    await pulsar(boton('Nueva ausencia'));
    await escribir('inc-persona', 'per-01', 'change');
    expect(raiz.textContent).toContain('ya tiene otra incidencia que se solapa');
    expect(boton('Guardar cambios').disabled).toBe(false);
    await escribir('inc-desde', '2026-11-30');
    expect(raiz.textContent).toContain('«desde» no puede ser posterior');
    expect(boton('Guardar cambios').disabled).toBe(true);
  });

  it('quitar las afectadas es un solo paso de deshacer', async () => {
    const almacen = await montar();
    await pulsar(boton('Nueva ausencia'));
    await escribir('inc-persona', 'per-01', 'change');
    await escribir('inc-desde', '2026-11-23');
    await escribir('inc-hasta', '2026-11-25');
    await pulsar(boton('Guardar cambios'));
    expect(raiz.textContent).toContain('Afecta a 3 asignaciones ya hechas en 1 semana (23 nov)');
    await pulsar(boton('Quitar las afectadas'));
    expect(almacen.obtener().cuadrantes['2026-11-23']!.asignaciones.map((a) => a.id)).toEqual(['a2']);
    expect(boton('Quitar las afectadas').disabled).toBe(true);
    await act(() => almacen.deshacer());
    expect(almacen.obtener().cuadrantes['2026-11-23']!.asignaciones).toHaveLength(4);
  });

  it('«Ir a la semana y recubrir» quita y navega; «Ir a la semana» solo navega', async () => {
    const almacen = await montar();
    await pulsar(boton('Nuevo cierre de puesto'));
    await escribir('inc-puesto', 'puesto-caja1', 'change');
    await escribir('inc-desde', '2026-11-30');
    await escribir('inc-hasta', '2026-12-06');
    await pulsar(boton('Guardar cambios'));
    await pulsar(boton('Ir a la semana'));
    expect(llamadas).toEqual([['2026-11-30', false]]);
    expect(almacen.obtener().cuadrantes['2026-11-30']!.asignaciones).toHaveLength(2);
    await pulsar(boton('Ir a la semana y recubrir'));
    expect(llamadas.at(-1)).toEqual(['2026-11-30', true]);
    expect(almacen.obtener().cuadrantes['2026-11-30']!.asignaciones).toHaveLength(0);
    await act(() => almacen.deshacer());
    expect(almacen.obtener().cuadrantes['2026-11-30']!.asignaciones).toHaveLength(2);
  });

  it('recubrir una semana no toca las otras y las demás siguen con sus botones', async () => {
    const almacen = await montar();
    await pulsar(boton('Nueva ausencia'));
    await escribir('inc-persona', 'per-01', 'change');
    await escribir('inc-desde', '2026-11-23');
    await escribir('inc-hasta', '2026-11-30');
    await pulsar(boton('Guardar cambios'));
    const antes23 = almacen.obtener().cuadrantes['2026-11-23']!.asignaciones.length;
    const botones = () => [...raiz.querySelectorAll('.incidencias-semanas button')].filter((b) => b.textContent === 'Ir a la semana y recubrir') as HTMLButtonElement[];
    expect(botones()).toHaveLength(2);
    await pulsar(botones()[1]!);
    expect(llamadas.at(-1)).toEqual(['2026-11-30', true]);
    expect(almacen.obtener().cuadrantes['2026-11-23']!.asignaciones).toHaveLength(antes23);
    expect(botones().length).toBeGreaterThanOrEqual(1);
    expect(raiz.querySelectorAll('.incidencias-semanas li')).toHaveLength(2);
    expect(raiz.querySelector('.incidencias-semanas')!.textContent).toContain('ya tratada');
  });

  it('el panel de impacto no es role="status" entero', async () => {
    await montar();
    await pulsar(boton('Nueva ausencia'));
    await escribir('inc-persona', 'per-01', 'change');
    await escribir('inc-desde', '2026-11-23');
    await escribir('inc-hasta', '2026-11-25');
    await pulsar(boton('Guardar cambios'));
    const panel = raiz.querySelector('.incidencias-panel')!;
    expect(panel.getAttribute('role')).toBeNull();
    for (const s of panel.querySelectorAll('[role="status"]')) expect(s.querySelector('button')).toBeNull();
    expect(panel.querySelector('[role="status"]')).not.toBeNull();
  });

  it('«Todo el día» desactivado pide un tramo horario', async () => {
    await montar();
    await pulsar(boton('Nueva ausencia'));
    expect(campo('inc-inicio')).toBeNull();
    await pulsar(campo('inc-todo-dia'));
    expect(campo('inc-inicio').value).toBe('10:00');
    expect(campo('inc-fin').value).toBe('13:00');
    expect(raiz.textContent).toContain('Sin motivos ni datos personales');
  });

  it('borra con confirmación y se puede deshacer', async () => {
    const almacen = await montar();
    await pulsar(boton('Borrar: EMP-01 ausente del lunes 23 nov al martes 24 nov'));
    expect(raiz.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(almacen.obtener().incidencias).toHaveLength(3);
    await pulsar(raiz.querySelector<HTMLButtonElement>('[role="alertdialog"] .peligro')!);
    expect(almacen.obtener().incidencias.map((i) => i.id)).toEqual(['i2', 'i3']);
    await act(() => almacen.deshacer());
    expect(almacen.obtener().incidencias).toHaveLength(3);
  });

  it('edita una incidencia existente', async () => {
    const almacen = await montar();
    await pulsar(boton('Editar: Caja 1 (Caja) cerrada el miércoles 25 nov'));
    await escribir('inc-nota', 'Obras');
    await pulsar(boton('Guardar cambios'));
    expect(almacen.obtener().incidencias.find((i) => i.id === 'i2')?.nota).toBe('Obras');
  });
});
