// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { estadoConAsignaciones } from '../../../tests/ayudas/datosPrueba';
import type { PeticionMotor, ProgresoMotor, ResultadoMotor } from '../../motor/contrato';
import type { EstadoApp } from '../../modelo/tipos';
import { crearAlmacenApp } from '../estado';
import { MotorCancelado, type EjecutorMotor } from '../usarMotor';
import { Generar } from './Generar';

vi.mock('../../motor/motor', () => ({ motor: { generar: () => { throw new Error('no se usa'); }, sugerir: () => [] }, MAX_ITERACIONES_POR_DEFECTO: 123 }));

const LUNES = '2026-11-23';
let raiz: HTMLElement;

beforeEach(() => {
  raiz = document.createElement('div');
  document.body.appendChild(raiz);
});
afterEach(() => {
  render(null, raiz);
  raiz.remove();
});

const vacio: ResultadoMotor = { asignaciones: [], sinCubrir: [], comidasPendientes: [], penalizacionBlanda: 7, iteraciones: 10, ms: 5, cortadoPorTiempo: false };

interface Control {
  peticiones: PeticionMotor[];
  progreso: (p: ProgresoMotor) => void;
  resolver: (r: ResultadoMotor) => void;
  rechazar: (e: unknown) => void;
  cancelar: ReturnType<typeof vi.fn>;
}

function motorFalso(): { ejecutar: EjecutorMotor; control: Control } {
  const control = {
    peticiones: [] as PeticionMotor[],
    progreso: (_p: ProgresoMotor) => {},
    resolver: (_r: ResultadoMotor) => {},
    rechazar: (_e: unknown) => {},
    cancelar: vi.fn(),
  };
  const ejecutar: EjecutorMotor = (peticion, alProgresar) => {
    control.peticiones.push(peticion);
    control.progreso = alProgresar;
    const promesa = new Promise<ResultadoMotor>((res, rej) => {
      control.resolver = res;
      control.rechazar = rej;
    });
    return { promesa, cancelar: () => control.cancelar() };
  };
  return { ejecutar, control };
}

async function montar(estado: EstadoApp = crearEstadoEjemplo()) {
  const almacen = crearAlmacenApp(estado, { guardar: () => ({ ok: true }) });
  const { ejecutar, control } = motorFalso();
  await act(() => render(<Generar almacen={almacen} lunes={LUNES} ejecutar={ejecutar} />, raiz));
  return { almacen, control };
}

const boton = (texto: string) => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto) as HTMLButtonElement;
const pulsar = (el: HTMLElement) => act(() => el.click());
const radios = () => [...raiz.querySelectorAll<HTMLInputElement>('input[type=radio]')];

describe('Generar', () => {
  it('sin semana tipo preselecciona «Completar huecos»; con semana tipo, la semana tipo', async () => {
    await montar();
    await pulsar(boton('Generar semana'));
    expect(radios().map((r) => r.checked)).toEqual([false, true, false]);
    expect(radios()[0]!.disabled).toBe(true);
    expect(raiz.textContent).toContain('No hay semana tipo para la semana A');
    render(null, raiz);
    await montar(estadoConAsignaciones());
    await pulsar(boton('Generar semana'));
    expect(radios().map((r) => r.checked)).toEqual([true, false, false]);
  });

  it('avisa de que se reemplazará lo no bloqueado solo en «desde cero»', async () => {
    await montar();
    await pulsar(boton('Generar semana'));
    expect(raiz.textContent).not.toContain('Se reemplazará');
    await act(() => radios()[2]!.click());
    expect(raiz.textContent).toContain('Se reemplazará todo lo que no tenga candado');
  });

  it('lanza la petición con semilla, iteraciones y límite de la configuración y muestra un progreso accesible', async () => {
    const { control } = await montar();
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    const p = control.peticiones[0]!;
    expect(p.modo).toBe('completarHuecos');
    expect(p.semilla).toBe(1);
    expect(p.maxIteraciones).toBe(123);
    expect(p.limiteMs).toBe(3000);
    expect(p.lunes).toBe(LUNES);
    await act(() => control.progreso({ fase: 'construccion', fraccion: 0.4, huecosSinCubrir: 3, penalizacionBlanda: 0 }));
    const barra = raiz.querySelector('[role=progressbar]')!;
    expect(barra.getAttribute('aria-valuenow')).toBe('40');
    expect(raiz.textContent).toContain('Colocando personas en los puestos');
  });

  it('Cancelar termina la ejecución y cierra el panel', async () => {
    const { control } = await montar();
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    await pulsar(boton('Cancelar'));
    expect(control.cancelar).toHaveBeenCalled();
    await act(async () => {
      control.rechazar(new MotorCancelado());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(raiz.querySelector('#gen-panel')).toBeNull();
  });

  it('muestra el resumen y Aplicar escribe el cuadrante con meta y un paso de deshacer', async () => {
    const { almacen, control } = await montar();
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    const resultado: ResultadoMotor = {
      ...vacio,
      cortadoPorTiempo: true,
      asignaciones: [{ id: 'a1', tipo: 'pausa', fecha: LUNES, personaId: 'x', inicio: 780, fin: 840, bloqueada: false, origen: 'motor' }],
      comidasPendientes: [{ personaId: 'x', fecha: LUNES, motivo: 'EMP-01 no tiene comida el lunes' }],
      sinCubrir: [
        {
          hueco: { fecha: LUNES, dia: 0, puestoId: 'p', areaId: 'a', franjaId: 'f', plaza: 0, bloqueId: null, inicio: 600, fin: 660 },
          resumen: 'Nadie habilitado disponible el lunes 10:00–11:00',
          descartes: [{ personaId: 'y', motivo: 'EMP-03 ya está en Caja 1' }],
        },
      ],
    };
    await act(async () => {
      control.resolver(resultado);
      await Promise.resolve();
      await Promise.resolve();
    });
    const texto = raiz.textContent ?? '';
    expect(texto).toContain('Cobertura:');
    expect(texto).toContain('Nadie habilitado disponible el lunes 10:00–11:00');
    expect(texto).toContain('EMP-03 ya está en Caja 1');
    expect(texto).toContain('Comidas pendientes (1)');
    expect(texto).toContain('límite de tiempo');
    expect(texto).toContain('Preferencias no cumplidas: 7 puntos (cuanto más bajo, mejor)');
    await pulsar(boton('Aplicar'));
    const c = almacen.obtener().cuadrantes[LUNES]!;
    expect(c.asignaciones).toEqual(resultado.asignaciones);
    expect(c.meta.modo).toBe('completarHuecos');
    expect(c.meta.semilla).toBe(1);
    expect(c.meta.generado).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(almacen.descripcionDeshacer()).toBe('Generar semana del 23/11 (completar huecos)');
    expect(raiz.querySelector('#gen-panel')).toBeNull();
  });

  it('Descartar no cambia nada y «Probar otra variante» suma 1 a la semilla', async () => {
    const { almacen, control } = await montar();
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    await act(async () => {
      control.resolver(vacio);
      await Promise.resolve();
      await Promise.resolve();
    });
    await pulsar(boton('Probar otra variante'));
    expect(control.peticiones.map((p) => p.semilla)).toEqual([1, 2]);
    await act(async () => {
      control.resolver(vacio);
      await Promise.resolve();
      await Promise.resolve();
    });
    await pulsar(boton('Descartar'));
    expect(almacen.puedeDeshacer()).toBe(false);
    expect(raiz.querySelector('#gen-panel')).toBeNull();
  });

  it('un error del motor se muestra como alerta en español', async () => {
    const { control } = await montar();
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    await act(async () => {
      control.rechazar(new Error('No se pudo generar el cuadrante.'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(raiz.querySelector('[role=alert]')?.textContent).toContain('No se pudo generar el cuadrante.');
  });

  it('no aplica si la semana cambió mientras se generaba y ofrece volver a generar', async () => {
    const { almacen, control } = await montar();
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    await act(async () => {
      control.resolver(vacio);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(() => almacen.aplicar('cambio a mano', (e) => ({ ...e, cuadrantes: { ...e.cuadrantes, [LUNES]: { lunes: LUNES, asignaciones: [], meta: { modo: null, semilla: null, generado: null } } } })));
    await pulsar(boton('Aplicar'));
    expect(raiz.textContent).toContain('La semana ha cambiado mientras se generaba. Vuelve a generar para no perder esos cambios.');
    expect(almacen.descripcionDeshacer()).toBe('cambio a mano');
    await pulsar(boton('Volver a generar'));
    expect(control.peticiones).toHaveLength(2);
  });

  it('agrupa los huecos de un mismo bloque en una entrada con el intervalo completo', async () => {
    const { control } = await montar();
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    const h = { fecha: LUNES, dia: 0 as const, puestoId: 'p', areaId: 'a', plaza: 0, bloqueId: 'b' };
    const resultado: ResultadoMotor = {
      ...vacio,
      sinCubrir: [
        { hueco: { ...h, franjaId: 'f1', inicio: 600, fin: 690 }, resumen: 'Nadie disponible el lunes 10:00–11:30', descartes: [{ personaId: 'y', motivo: 'EMP-03 ya está en Caja 1' }] },
        { hueco: { ...h, franjaId: 'f2', inicio: 690, fin: 780 }, resumen: 'Nadie disponible el lunes 11:30–13:00', descartes: [{ personaId: 'y', motivo: 'EMP-03 ya está en Caja 1' }] },
      ],
    };
    await act(async () => {
      control.resolver(resultado);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(raiz.textContent).toContain('Huecos sin cubrir (1)');
    expect(raiz.textContent).toContain('Nadie disponible el lunes 10:00–13:00');
    expect(raiz.textContent).toContain('Por qué no puede cada persona (1)');
  });

  it('lista los avisos obligatorios que quedan sin resolver, sin contar los huecos', async () => {
    const { control } = await montar();
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    // Una asignación a una persona inexistente incumple «personaDisponible» (obligatoria, no es un hueco).
    const resultado: ResultadoMotor = {
      ...vacio,
      asignaciones: [{ id: 'z', tipo: 'pausa', fecha: LUNES, personaId: 'nadie', inicio: 780, fin: 840, bloqueada: false, origen: 'motor' }],
    };
    await act(async () => {
      control.resolver(resultado);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(raiz.textContent).toMatch(/aviso(s)? obligatorio(s)? que el generador no ha podido resolver/);
  });

  it('un arranque externo con un resultado pendiente pregunta antes de descartarlo', async () => {
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
    const { ejecutar, control } = motorFalso();
    const pintar = (nonce: number | null) =>
      act(() => render(<Generar almacen={almacen} lunes={LUNES} ejecutar={ejecutar} arrancar={nonce === null ? null : { modo: 'completarHuecos', nonce }} />, raiz));
    await pintar(null);
    await pulsar(boton('Generar semana'));
    await pulsar(boton('Empezar'));
    await act(async () => control.resolver(vacio));
    expect(control.peticiones).toHaveLength(1);
    await pintar(1);
    expect(control.peticiones).toHaveLength(1);
    expect(raiz.textContent).toContain('Hay un resultado sin aplicar. ¿Lo descartas y recubres los huecos?');
    await pulsar(boton('Mantener el resultado'));
    expect(raiz.textContent).not.toContain('Hay un resultado sin aplicar');
    expect(control.peticiones).toHaveLength(1);
    await pintar(2);
    await pulsar(boton('Descartar y recubrir'));
    expect(control.peticiones).toHaveLength(2);
  });
});
