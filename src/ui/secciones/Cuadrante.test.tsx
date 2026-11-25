// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { estadoConAsignaciones } from '../../../tests/ayudas/datosPrueba';
import type { EstadoApp, FechaISO } from '../../modelo/tipos';
import type { Incumplimiento, MarcaCelda, ResultadoValidacion } from '../../reglas/contrato';
import type { Candidato, Motor } from '../../motor/contrato';
import { crearAlmacenApp } from '../estado';
import { Cuadrante, type FocoCuadrante } from './Cuadrante';

let raiz: HTMLElement;
const LUNES = '2026-11-23';
const { caja1, lego } = IDS_EJEMPLO.puestos;
const claveCaja = (fecha: string, franja: string) => `${fecha}|${caja1}|${franja}|0`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 24, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  render(null, raiz);
  raiz.remove();
});

function inc(marca: MarcaCelda, campos: Partial<Incumplimiento>): Incumplimiento {
  return {
    reglaId: 'r', origen: 'general', tipo: 'sinSolapes', dura: true, penalizacion: 0, mensaje: 'x', marca,
    fecha: null, personaId: null, asignacionIds: [], huecos: [], ...campos,
  };
}
const resultadoCon = (incumplimientos: Incumplimiento[]): ResultadoValidacion => ({ semaforo: 'rojo', incumplimientos, penalizacionBlanda: 0 });

async function montar(
  estado: EstadoApp = crearEstadoEjemplo(),
  resultado: ResultadoValidacion | null = null,
  foco: FocoCuadrante | null = null,
  motor?: Pick<Motor, 'sugerir'>,
) {
  const almacen = crearAlmacenApp(estado, { guardar: () => ({ ok: true }) });
  const alCambiarSemana = vi.fn<(l: FechaISO) => void>();
  raiz = document.createElement('div');
  document.body.appendChild(raiz);
  const pintar = (r: ResultadoValidacion | null, f: FocoCuadrante | null) =>
    act(() => render(<Cuadrante almacen={almacen} resultado={r} foco={f} alCambiarSemana={alCambiarSemana} motor={motor} />, raiz));
  await pintar(resultado, foco);
  return { almacen, alCambiarSemana, pintar };
}

const boton = (texto: string) => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto) as HTMLButtonElement;
const pestana = (nombre: string) => [...raiz.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((b) => b.textContent?.trim() === nombre)!;
const celda = (clave: string) => raiz.querySelector<HTMLButtonElement>(`[data-clave="${clave}"]`)!;
const pulsar = (el: HTMLElement) => act(() => el.click());
const selectEditor = () => raiz.querySelector<HTMLSelectElement>('.cq-editor select')!;
async function elegir(sel: HTMLSelectElement, valor: string) {
  await act(() => {
    sel.value = valor;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function elegirYAsignar(valor: string) {
  await elegir(selectEditor(), valor);
  await pulsar(boton('Asignar'));
}
async function asignarEnCaja(personaId = 'per-07') {
  await pulsar(pestana('Caja'));
  await pulsar(celda(claveCaja('2026-11-26', 'franja-caja-1')));
  await elegirYAsignar(personaId);
}

describe('Cuadrante', () => {
  it('empieza en el lunes de hoy, avisa de la semana y muestra las pestañas', async () => {
    const { alCambiarSemana } = await montar();
    expect(alCambiarSemana).toHaveBeenLastCalledWith(LUNES);
    expect(raiz.textContent).toContain('Semana del 23/11/2026 al 29/11/2026 · Semana A');
    const nombres = [...raiz.querySelectorAll('[role=tab]')].map((t) => t.textContent?.trim());
    expect(nombres).toEqual(['Pedidos Web', 'Caja', 'Exposición LEGO', 'Por persona']);
  });

  it('asigna a una persona en Caja 1 (todo el bloque) y se puede deshacer', async () => {
    const { almacen } = await montar();
    await pulsar(pestana('Caja'));
    const c = celda(claveCaja('2026-11-26', 'franja-caja-1'));
    expect(c.getAttribute('aria-label')).toBe('Caja 1, jueves 26/11, 10:00–11:30: sin cubrir');
    await pulsar(c);
    expect(document.activeElement).toBe(selectEditor());
    await elegirYAsignar('per-07');
    const asignaciones = almacen.obtener().cuadrantes[LUNES]?.asignaciones ?? [];
    expect(asignaciones.map((a) => a.tipo === 'puesto' && a.franjaId)).toEqual(['franja-caja-1', 'franja-caja-2']);
    expect(almacen.descripcionDeshacer()).toBe('Asignar EMP-07 a Caja 1, jueves 26/11 10:00–13:00');
    expect(celda(claveCaja('2026-11-26', 'franja-caja-2')).getAttribute('aria-label')).toBe('Caja 1, jueves 26/11, 11:30–13:00: EMP-07');
    await act(() => almacen.deshacer());
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones ?? []).toHaveLength(0);
    expect(celda(claveCaja('2026-11-26', 'franja-caja-1')).getAttribute('aria-label')).toContain('sin cubrir');
  });

  it('sin marcar «Aplicar a todo el bloque» asigna solo la franja', async () => {
    const { almacen } = await montar();
    await pulsar(pestana('Caja'));
    await pulsar(celda(claveCaja('2026-11-26', 'franja-caja-1')));
    await pulsar(raiz.querySelector<HTMLInputElement>('.cq-editor input[type=checkbox]')!);
    await elegirYAsignar('per-07');
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones).toHaveLength(1);
    expect(almacen.descripcionDeshacer()).toBe('Asignar EMP-07 a Caja 1, jueves 26/11 10:00–11:30');
  });

  it('ordena las personas con las sugerencias del motor: permitidas primero con su coste y no permitidas al final con el motivo', async () => {
    const candidatos: Candidato[] = [
      { personaId: 'per-07', permitido: true, coste: 0, motivos: [] },
      { personaId: 'per-03', permitido: true, coste: 4, motivos: ['a', 'b'] },
      { personaId: 'per-01', permitido: false, coste: 0, motivos: ['EMP-01 sin habilitación'] },
    ];
    const sugerir = vi.fn(() => candidatos);
    await montar(crearEstadoEjemplo(), null, null, { sugerir });
    await pulsar(pestana('Caja'));
    await pulsar(celda(claveCaja('2026-11-26', 'franja-caja-1')));
    expect(sugerir).toHaveBeenCalled();
    const textos = [...selectEditor().options].slice(1).map((o) => o.textContent);
    expect(textos).toEqual(['EMP-07', 'EMP-03 (preferible: a; +1 más)', 'EMP-01 (no permitido: EMP-01 sin habilitación)']);
    expect([...selectEditor().options][2]?.title).toBe('EMP-03, preferible: a; b');
    expect((sugerir.mock.calls[0] as unknown[] | undefined)?.[3]).toMatchObject({ bloqueId: expect.any(String) });
    await pulsar(raiz.querySelector<HTMLInputElement>('.cq-editor input[type=checkbox]')!);
    expect((sugerir.mock.calls.at(-1) as unknown[] | undefined)?.[3]).toMatchObject({ bloqueId: null });
    await elegirYAsignar('per-03');
    expect((sugerir.mock.calls[0] as unknown[] | undefined)?.[3]).toMatchObject({ fecha: '2026-11-26', franjaId: 'franja-caja-1' });
  });

  it('quita lo asignado', async () => {
    const { almacen } = await montar();
    await asignarEnCaja();
    await pulsar(boton('Quitar'));
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones).toHaveLength(0);
    expect(almacen.descripcionDeshacer()).toBe('Quitar EMP-07 de Caja 1, jueves 26/11 10:00–13:00');
  });

  it('bloquea con candado, lo anuncia en la celda y no deja cambiar', async () => {
    const { almacen } = await montar();
    await asignarEnCaja();
    await pulsar(boton('Bloquear'));
    const asignaciones = almacen.obtener().cuadrantes[LUNES]?.asignaciones ?? [];
    expect(asignaciones.every((a) => a.bloqueada)).toBe(true);
    expect(almacen.descripcionDeshacer()).toBe('Bloquear la asignación de EMP-07 en Caja 1, jueves 26/11 10:00–13:00');
    expect(celda(claveCaja('2026-11-26', 'franja-caja-1')).getAttribute('aria-label')).toBe('Caja 1, jueves 26/11, 10:00–11:30: EMP-07, bloqueada');
    expect(selectEditor().disabled).toBe(true);
    expect(boton('Quitar').disabled).toBe(true);
    await pulsar(boton('Desbloquear'));
    expect(selectEditor().disabled).toBe(false);
  });

  it('cambia de semana y avisa', async () => {
    const { alCambiarSemana } = await montar();
    await pulsar(boton('Semana siguiente'));
    expect(alCambiarSemana).toHaveBeenLastCalledWith('2026-11-30');
    expect(raiz.textContent).toContain('Semana del 30/11/2026 al 06/12/2026 · Semana B');
    await pulsar(boton('Semana anterior'));
    await pulsar(boton('Semana anterior'));
    expect(alCambiarSemana).toHaveBeenLastCalledWith('2026-11-16');
    await pulsar(boton('Esta semana'));
    expect(alCambiarSemana).toHaveBeenLastCalledWith(LUNES);
  });

  it('pinta las marcas del resultado con icono y texto', async () => {
    const resultado = resultadoCon([
      inc('solape', { asignacionIds: ['a1'] }),
      inc('noDisponible', { asignacionIds: ['a2'] }),
      inc('comidaSinTurno', { asignacionIds: ['p1'] }),
      inc('aviso', { huecos: [claveCaja('2026-11-24', 'franja-caja-3')] }),
    ]);
    await montar(estadoConAsignaciones(), resultado);
    await pulsar(pestana('Caja'));
    const a1 = celda(claveCaja('2026-11-23', 'franja-caja-1'));
    expect(a1.getAttribute('aria-label')).toBe('Caja 1, lunes 23/11, 10:00–11:30: EMP-01, solape');
    expect(a1.classList.contains('cq-top-solape')).toBe(true);
    expect(a1.textContent).toContain('Solape');
    expect(a1.querySelector('svg')).not.toBeNull();
    expect(celda(claveCaja('2026-11-24', 'franja-caja-2')).textContent).toContain('No disponible');
    const vacia = celda(claveCaja('2026-11-24', 'franja-caja-3'));
    expect(vacia.getAttribute('aria-label')).toBe('Caja 1, martes 24/11, 13:00–14:30: sin cubrir, aviso');
    expect(vacia.classList.contains('cq-vacia')).toBe(true);
    expect(vacia.textContent).toContain('Sin cubrir');
    expect(raiz.querySelector('[data-pausa="p1"]')?.textContent).toContain('Comida sin turno');
  });

  it('el foco cambia de área, de semana y enfoca la celda', async () => {
    const { pintar, alCambiarSemana } = await montar(estadoConAsignaciones());
    await pulsar(pestana('Caja'));
    await pintar(null, { hueco: `2026-11-25|${lego}|franja-lego-1|0`, nonce: 1 });
    expect(pestana('Exposición LEGO').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(raiz.querySelector(`[data-clave="2026-11-25|${lego}|franja-lego-1|0"]`));
    await pintar(null, { asignacionId: 'a5', nonce: 2 });
    expect(alCambiarSemana).toHaveBeenLastCalledWith(LUNES);
    // a5 está en la semana del 30/11, que no es la visible: no se encuentra y no cambia nada.
    expect(pestana('Exposición LEGO').getAttribute('aria-selected')).toBe('true');
    await pintar(null, { asignacionId: 'a1', nonce: 3 });
    expect(pestana('Caja').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(celda(claveCaja('2026-11-23', 'franja-caja-1')));
  });

  it('añade y quita una comida', async () => {
    const { almacen } = await montar();
    await pulsar(raiz.querySelector<HTMLButtonElement>('[aria-label="Añadir comida el jueves 26/11"]')!);
    await elegir(raiz.querySelector<HTMLSelectElement>('.cq-form-pausa select')!, 'per-03');
    await pulsar(boton('Añadir'));
    const pausa = almacen.obtener().cuadrantes[LUNES]?.asignaciones[0];
    expect(pausa).toMatchObject({ tipo: 'pausa', personaId: 'per-03', inicio: 840, fin: 900, fecha: '2026-11-26' });
    expect(almacen.descripcionDeshacer()).toBe('Añadir comida de EMP-03, jueves 26/11 14:00–15:00');
    await pulsar(raiz.querySelector<HTMLButtonElement>('[aria-label="Quitar la comida de EMP-03 14:00–15:00"]')!);
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones).toHaveLength(0);
  });

  it('vacía la semana con confirmación y respetando candados', async () => {
    const { almacen } = await montar();
    await asignarEnCaja();
    await pulsar(boton('Bloquear'));
    await pulsar(boton('Vaciar semana'));
    expect(raiz.querySelector('[role=alertdialog]')).not.toBeNull();
    await pulsar(raiz.querySelector<HTMLButtonElement>('.cq-vaciando .peligro')!);
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones).toHaveLength(2);
    await pulsar(boton('Vaciar semana'));
    await pulsar(raiz.querySelector<HTMLInputElement>('.cq-vaciando input')!);
    await pulsar(raiz.querySelector<HTMLButtonElement>('.cq-vaciando .peligro')!);
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones).toHaveLength(0);
    expect(almacen.descripcionDeshacer()).toBe('Vaciar la semana del 23/11/2026');
  });

  it('vista por persona: huecos, comidas y minutos por día', async () => {
    await montar(estadoConAsignaciones());
    await pulsar(pestana('Por persona'));
    await elegir(raiz.querySelector<HTMLSelectElement>('.cq-persona select')!, 'per-01');
    expect(raiz.textContent).toContain('EMP-01: 2h28 de cobertura en 2 días');
    expect(raiz.querySelector('[aria-label="Ver Caja 1, lunes 23/11, 10:00–11:30 en el cuadrante"]')).not.toBeNull();
    expect(raiz.textContent).toContain('Comida 14:00–15:00');
    await pulsar(raiz.querySelector<HTMLButtonElement>('[aria-label^="Ver Caja 1, lunes 23/11"]')!);
    expect(pestana('Caja').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(celda(claveCaja('2026-11-23', 'franja-caja-1')));
  });

  it('elegir en el desplegable no asigna hasta pulsar «Asignar» o Intro', async () => {
    const { almacen } = await montar();
    await pulsar(pestana('Caja'));
    await pulsar(celda(claveCaja('2026-11-26', 'franja-caja-1')));
    expect(boton('Asignar').disabled).toBe(true);
    await elegir(selectEditor(), 'per-07');
    await elegir(selectEditor(), 'per-03');
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones ?? []).toHaveLength(0);
    expect(boton('Asignar').disabled).toBe(false);
    await act(() => void selectEditor().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones.every((a) => a.personaId === 'per-03')).toBe(true);
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones).toHaveLength(2);
  });

  it('la comida con candado no se puede quitar y lo explica', async () => {
    const { almacen } = await montar();
    await pulsar(raiz.querySelector<HTMLButtonElement>('[aria-label="Añadir comida el jueves 26/11"]')!);
    await elegir(raiz.querySelector<HTMLSelectElement>('.cq-form-pausa select')!, 'per-03');
    await pulsar(boton('Añadir'));
    await pulsar(raiz.querySelector<HTMLButtonElement>('[aria-label="Bloquear la comida de EMP-03 14:00–15:00"]')!);
    const quitarBtn = raiz.querySelector<HTMLButtonElement>('[aria-label="Quitar la comida de EMP-03 14:00–15:00"]')!;
    expect(quitarBtn.getAttribute('aria-disabled')).toBe('true');
    expect(raiz.querySelector(`#${quitarBtn.getAttribute('aria-describedby')}`)?.textContent).toContain('candado');
    await pulsar(quitarBtn);
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones).toHaveLength(1);
  });

  it('muestra las asignaciones fuera del horario, permite quitarlas y el foco llega a ellas', async () => {
    const e = estadoConAsignaciones();
    const sana = e.cuadrantes[LUNES]!.asignaciones;
    e.cuadrantes[LUNES] = {
      ...e.cuadrantes[LUNES]!,
      asignaciones: [
        ...sana,
        { id: 'fuera1', tipo: 'puesto', fecha: '2026-11-26', puestoId: caja1, franjaId: 'no-existe', plaza: 0, personaId: 'per-02', bloqueada: false, origen: 'manual' },
      ],
    };
    const { almacen, pintar } = await montar(e);
    const item = raiz.querySelector<HTMLElement>('[data-fuera="fuera1"]')!;
    expect(item.textContent).toContain('EMP-02');
    expect(item.textContent).toContain('la franja ya no existe');
    await pintar(null, { asignacionId: 'fuera1', nonce: 7 });
    expect(document.activeElement).toBe(item);
    await pulsar(item.querySelector('button')!);
    expect(almacen.obtener().cuadrantes[LUNES]?.asignaciones.some((a) => a.id === 'fuera1')).toBe(false);
    expect(raiz.querySelector('[data-fuera]')).toBeNull();
  });

  it('la vista por persona marca lo que está fuera del horario y no suma sus minutos', async () => {
    const e = estadoConAsignaciones();
    e.cuadrantes[LUNES] = {
      ...e.cuadrantes[LUNES]!,
      asignaciones: [
        { id: 'fuera1', tipo: 'puesto', fecha: '2026-11-26', puestoId: caja1, franjaId: 'no-existe', plaza: 0, personaId: 'per-02', bloqueada: false, origen: 'manual' },
      ],
    };
    await montar(e);
    await pulsar(pestana('Por persona'));
    await elegir(raiz.querySelector<HTMLSelectElement>('.cq-persona select')!, 'per-02');
    expect(raiz.querySelector('.cq-persona')!.textContent).toContain('Fuera del horario');
    expect(raiz.querySelector('.cq-persona')!.textContent).not.toContain('00:00');
    expect(raiz.querySelector('.cq-total')!.textContent).toContain('0');
  });

  it('muestra el semáforo compacto con el botón para ir a los incumplimientos', async () => {
    document.body.insertAdjacentHTML('beforeend', '<h3 id="pv-incumplimientos" tabindex="-1">Incumplimientos</h3>');
    await montar(crearEstadoEjemplo(), resultadoCon([inc('solape', {}), inc('solape', {})]));
    const barra = raiz.querySelector('.cq-semaforo')!;
    expect(barra.textContent).toContain('2 incumplimientos obligatorios');
    await pulsar(boton('Ver incumplimientos'));
    expect(document.activeElement?.id).toBe('pv-incumplimientos');
    document.getElementById('pv-incumplimientos')!.remove();
  });

  it('avisa de que la semana no tiene horario y ofrece importarlo', async () => {
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
    raiz = document.createElement('div');
    document.body.appendChild(raiz);
    const importar = vi.fn();
    await act(() => render(<Cuadrante almacen={almacen} resultado={null} alImportarHorario={importar} />, raiz));
    const aviso = raiz.querySelector('.cq-aviso-horario')!;
    expect(aviso.getAttribute('role')).toBe('status');
    expect(aviso.textContent).toContain('Esta semana no tiene horario de la plantilla');
    await pulsar(boton('Importar horario'));
    expect(importar).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('con horario muestra el aviso con el número de personas y el turno en Por persona', async () => {
    const base = crearEstadoEjemplo();
    const estado = {
      ...base,
      horarios: {
        [LUNES]: {
          lunes: LUNES,
          actualizado: null,
          turnos: [
            { personaId: 'per-01', fecha: LUNES, tramos: [{ inicio: 600, fin: 945 }] },
            { personaId: 'per-02', fecha: LUNES, tramos: [] },
          ],
        },
      },
    };
    await montar(estado);
    expect(raiz.querySelector('.cq-aviso-horario')!.textContent).toContain('Horario de la plantilla cargado: 1 persona trabaja esta semana.');
    await pulsar(pestana('Por persona'));
    await elegir(raiz.querySelector<HTMLSelectElement>('.cq-persona select')!, 'per-01');
    expect(raiz.textContent).toContain('Turno: 10:00–15:45');
  });
});
