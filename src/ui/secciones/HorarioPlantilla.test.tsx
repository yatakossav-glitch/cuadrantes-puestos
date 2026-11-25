// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { crearAlmacenApp } from '../estado';
import type { AlmacenApp } from '../estado';
import { HorarioPlantilla } from './HorarioPlantilla';

let raiz: HTMLElement;
const SEMANA = '2026-11-30'; // la siguiente a hoy (24/11/2026)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 24, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  render(null, raiz);
  raiz.remove();
});

async function montar(alIrASemana: (l: string) => void = () => {}): Promise<AlmacenApp> {
  const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
  raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(() => render(<HorarioPlantilla almacen={almacen} alIrASemana={alIrASemana} />, raiz));
  return almacen;
}
const boton = (t: string) => {
  const todos = [...raiz.querySelectorAll('button')];
  return (todos.find((b) => b.textContent === t) ?? todos.find((b) => b.textContent?.includes(t))) as HTMLButtonElement;
};
async function pegar(texto: string) {
  const area = raiz.querySelector('textarea')!;
  await act(() => {
    area.value = texto;
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() => boton('Leer horario').click());
}
const TABLA = 'Código\tLun\tMar\tMié\tJue\tVie\tSáb\tDom\nEMP-01\t10:00-15:45\tT\tL\t10-14 y 17-21\tM\tL\tL\nEMP-02\t10:00-15:45\tL\tL\tL\tL\tL\tL';

describe('HorarioPlantilla', () => {
  it('propone la semana siguiente y deja Leer desactivado sin texto', async () => {
    await montar();
    expect(raiz.textContent).toContain('Semana del 30/11/2026 al 06/12/2026');
    expect(raiz.textContent).toContain('Semana B');
    expect(boton('Leer horario').disabled).toBe(true);
  });

  it('lee, muestra la vista previa y guarda con confirmación', async () => {
    const ir = vi.fn();
    const almacen = await montar(ir);
    await pegar(TABLA);
    expect(raiz.textContent).toContain('10:00–14:00 y 17:00–21:00');
    expect(raiz.textContent).toContain('Libra');
    await act(() => boton('Guardar horario de la semana').click());
    expect(raiz.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(() => boton('Sí, guardar horario').click());
    expect(Object.keys(almacen.obtener().horarios)).toEqual([SEMANA]);
    expect(raiz.querySelector('[role="status"]')?.textContent).toContain('guardado');
    await act(() => boton('Ir a la semana').click());
    expect(ir).toHaveBeenCalledWith(SEMANA);
    expect(raiz.textContent).toContain('Semana del 30/11/2026');
  });

  it('muestra el error con texto y bloquea guardar', async () => {
    await montar();
    await pegar('EMP-01\txx\tL\tL\tL\tL\tL\tL');
    expect(raiz.textContent).toContain('No entiendo');
    expect(boton('Guardar horario de la semana').disabled).toBe(true);
  });

  it('crea las personas que faltan y relee', async () => {
    const almacen = await montar();
    await pegar('EMP-90\tL\tL\tL\tL\tL\tL\tL');
    expect(raiz.textContent).toContain('no existe');
    await act(() => boton('Crear la persona que falta').click());
    expect(almacen.obtener().personas.some((p) => p.codigo === 'EMP-90')).toBe(true);
    expect(raiz.textContent).not.toContain('no existe');
  });

  it('edita una casilla de una semana guardada y puede quitarla', async () => {
    const almacen = await montar();
    await pegar(TABLA);
    await act(() => boton('Guardar horario de la semana').click());
    await act(() => boton('Sí, guardar horario').click());
    expect(raiz.textContent).toContain('2 personas');
    await act(() => boton('Ver y editar').click());
    const celda = raiz.querySelector<HTMLInputElement>('input[aria-label="EMP-01, martes"]')!;
    expect(celda.value).toBe('15:45–22:00');
    await act(() => {
      celda.value = 'zz';
      celda.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(raiz.textContent).toContain('No entiendo');
    expect(boton('Guardar cambios').disabled).toBe(true);
    await act(() => {
      celda.value = 'L';
      celda.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => boton('Guardar cambios').click());
    const h = almacen.obtener().horarios[SEMANA]!;
    const per = almacen.obtener().personas.find((p) => p.codigo === 'EMP-01')!;
    expect(h.turnos.find((t) => t.personaId === per.id && t.fecha === '2026-12-01')?.tramos).toEqual([]);
    await act(() => boton('Quitar').click());
    await act(() => boton('Sí, quitar horario').click());
    expect(almacen.obtener().horarios).toEqual({});
  });

  it('sin ningún código conocido: error bloqueante y sigue el botón de crear personas', async () => {
    await montar();
    await pegar('EMP-90\tL\tL\tL\tL\tL\tL\tL');
    expect(raiz.textContent).toContain('No se ha reconocido ningún código de la plantilla (EMP-…).');
    expect(boton('Guardar horario de la semana').disabled).toBe(true);
    expect(boton('Crear la persona que falta')).toBeTruthy();
  });

  describe('rejilla de edición', () => {
    const escribir = async (etiqueta: string, valor: string) => {
      const celda = raiz.querySelector<HTMLInputElement>(`input[aria-label="${etiqueta}"]`)!;
      await act(() => {
        celda.value = valor;
        celda.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    async function conSemanaGuardada() {
      const almacen = await montar();
      await pegar(TABLA);
      await act(() => boton('Guardar horario de la semana').click());
      await act(() => boton('Sí, guardar horario').click());
      return almacen;
    }

    it('el botón dice «Cerrar» con la rejilla abierta', async () => {
      await conSemanaGuardada();
      await act(() => boton('Ver y editar').click());
      const b = [...raiz.querySelectorAll('button')].find((x) => x.getAttribute('aria-expanded') === 'true')!;
      expect(b.textContent).toBe('Cerrar');
    });

    it('cerrar con cambios sin guardar pide confirmación; cancelar los conserva', async () => {
      await conSemanaGuardada();
      await act(() => boton('Ver y editar').click());
      await escribir('EMP-01, martes', 'L');
      await act(() => boton('Cerrar').click());
      expect(raiz.textContent).toContain('Cambios sin guardar');
      await act(() => boton('Cancelar').click());
      expect(raiz.querySelector<HTMLInputElement>('input[aria-label="EMP-01, martes"]')!.value).toBe('L');
      await act(() => boton('Cerrar').click());
      await act(() => boton('Sí, descartar cambios').click());
      expect(raiz.querySelector('input[aria-label="EMP-01, martes"]')).toBeNull();
    });

    it('cerrar sin cambios no pregunta', async () => {
      await conSemanaGuardada();
      await act(() => boton('Ver y editar').click());
      await act(() => boton('Cerrar').click());
      expect(raiz.textContent).not.toContain('Cambios sin guardar');
      expect(raiz.querySelector('input[aria-label="EMP-01, martes"]')).toBeNull();
    });

    it('al deshacer el horario guardado, la rejilla se reinicia con los datos actuales', async () => {
      const almacen = await conSemanaGuardada();
      await act(() => boton('Ver y editar').click());
      await escribir('EMP-01, martes', 'L');
      await act(() => boton('Guardar cambios').click());
      await act(() => boton('Ver y editar').click());
      expect(raiz.querySelector<HTMLInputElement>('input[aria-label="EMP-01, martes"]')!.value).toBe('L');
      await act(() => almacen.deshacer());
      expect(raiz.querySelector<HTMLInputElement>('input[aria-label="EMP-01, martes"]')!.value).toBe('15:45–22:00');
    });
  });

  it('una petición del Cuadrante cambia a la semana pedida', async () => {
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
    raiz = document.createElement('div');
    document.body.appendChild(raiz);
    await act(() => render(<HorarioPlantilla almacen={almacen} alIrASemana={() => {}} peticion={{ lunes: '2026-12-14', nonce: 1 }} />, raiz));
    expect(raiz.textContent).toContain('Semana del 14/12/2026 al 20/12/2026');
  });
});
