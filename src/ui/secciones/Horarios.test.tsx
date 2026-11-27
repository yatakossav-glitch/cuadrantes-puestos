// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { crearAlmacenApp } from '../estado';
import type { AlmacenApp } from '../estado';
import { Horarios } from './Horarios';

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
  await act(() => render(<Horarios almacen={almacen} alIrASemana={alIrASemana} />, raiz));
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
/** Tabla anual ficticia de 2026: número, nombre y 365 columnas de días. */
function anual(codigos: string[], celda: (p: number, d: number) => string = (p, d) => (d % 7 > 4 ? 'L  ' : 'M')): string {
  return codigos.map((c, p) => [c, `PERSONA ${p + 1}`, ...Array.from({ length: 365 }, (_, d) => celda(p, d))].join('\t')).join('\n');
}
const fijar = async (id: string, valor: string) => {
  const el = raiz.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(() => {
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const TABLA = 'Código\tLun\tMar\tMié\tJue\tVie\tSáb\tDom\nEMP-01\t10:00-15:45\tT\tL\t10-14 y 17-21\tM\tL\tL\nEMP-02\t10:00-15:45\tL\tL\tL\tL\tL\tL';

describe('Horarios', () => {
  it('es una página con título y deja Leer desactivado sin texto', async () => {
    await montar();
    expect(raiz.querySelector('h2')?.textContent).toBe('Horarios');
    expect(raiz.textContent).toContain('Pega aquí el horario copiado de Excel');
    expect(raiz.textContent).toContain('Copia en Excel todas las filas de las personas, con su número y nombre y todos los días');
    expect(boton('Leer horario').disabled).toBe(true);
  });

  it('formato semanal: lee, muestra la vista previa y guarda con confirmación', async () => {
    const ir = vi.fn();
    const almacen = await montar(ir);
    await pegar(TABLA);
    expect(raiz.textContent).toContain('2 personas · 7 días, del 30/11/2026 al 06/12/2026 · 1 semana completa');
    expect(raiz.textContent).toContain('10:00–14:00 y 17:00–21:00');
    expect(raiz.textContent).toContain('No trabaja (L)');
    await act(() => boton('Guardar el horario de 1 semana').click());
    expect(raiz.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(() => boton('Sí, guardar horario').click());
    expect(Object.keys(almacen.obtener().horarios)).toEqual([SEMANA]);
    expect(raiz.textContent).toContain('Horario de 1 semana guardado');
    await act(() => boton('Ir a la semana del 30/11/2026').click());
    expect(ir).toHaveBeenCalledWith(SEMANA);
  });

  it('formato anual: detecta 365 días, crea las personas con alias y habilitaciones y guarda desde la semana actual', async () => {
    const almacen = await montar();
    const antes = almacen.obtener().personas.length;
    const areasActivas = almacen.obtener().areas.filter((a) => a.activa).map((a) => a.id);
    await pegar(anual(['10000001', '10000002', '10000003']));
    expect(raiz.textContent).toContain('3 personas · 365 días, del 01/01/2026 al 31/12/2026 · 51 semanas completas');
    expect(raiz.textContent).toContain('Se crearán 3 personas: 10000001 (PERSONA 1)');
    expect(raiz.textContent).toContain('Se ha supuesto que la tabla empieza el 01/01/2026');
    expect(raiz.textContent).toContain('Códigos sin horario: L (');
    expect((raiz.querySelector('#hp-desde') as HTMLInputElement).value).toBe('2026-11-23');
    expect(raiz.textContent).toContain('Se guardarán 5 semanas.');
    expect(raiz.querySelector('caption')?.textContent).toContain('23/11/2026');
    await act(() => boton('Crear las 3 personas').click());
    const nuevas = almacen.obtener().personas.slice(antes);
    expect(nuevas.map((p) => [p.codigo, p.alias])).toEqual([['10000001', 'PERSONA 1'], ['10000002', 'PERSONA 2'], ['10000003', 'PERSONA 3']]);
    expect(nuevas[0]?.habilitaciones).toEqual(areasActivas);
    expect(raiz.textContent).not.toContain('Se crearán');
    await act(() => boton('Guardar el horario de 5 semanas').click());
    expect(raiz.textContent).toContain('Guardará 5 semanas nuevas');
    await act(() => boton('Sí, guardar horario').click());
    expect(Object.keys(almacen.obtener().horarios).sort()).toEqual(['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21']);
    expect(raiz.textContent).toContain('Ir a la semana del 23/11/2026');
  });

  it('sin alias ni habilitaciones si se desmarcan las casillas', async () => {
    const almacen = await montar();
    const antes = almacen.obtener().personas.length;
    await pegar(anual(['10000001']));
    await act(() => (raiz.querySelector('#hp-alias') as HTMLInputElement).click());
    const primeraArea = raiz.querySelector<HTMLInputElement>('input[id^="hp-area-"]')!;
    await act(() => primeraArea.click());
    await act(() => boton('Crear la persona').click());
    const nueva = almacen.obtener().personas[antes]!;
    expect(nueva.alias).toBeNull();
    expect(nueva.habilitaciones).not.toContain(primeraArea.id.replace('hp-area-', ''));
  });

  it('cambiar el primer día relee la tabla', async () => {
    await montar();
    await pegar(anual(['10000001']));
    await fijar('hp-primer-dia', '2025-01-01');
    expect(raiz.textContent).toContain('del 01/01/2025 al 31/12/2025');
  });

  it('con otro número de columnas pide el primer día', async () => {
    await montar();
    await pegar(['10000001', 'PERSONA 1', ...Array(20).fill('M')].join('\t'));
    expect(raiz.textContent).toContain('Indica el primer día de la tabla');
    expect(raiz.querySelector('#hp-primer-dia')).not.toBeNull();
    await fijar('hp-primer-dia', '2026-11-30');
    expect(raiz.textContent).toContain('1 persona · 20 días, del 30/11/2026 al 19/12/2026 · 2 semanas completas');
  });

  it('la vista previa marca los días cerrados y se puede cambiar de semana', async () => {
    await montar();
    await pegar(['10000001\tPERSONA 1\tM\t\tM\tM\tM\tL\tL\tT\tT\tT\tT\tT\tL\tL'].join('\n').replace(/^/, '') );
    await fijar('hp-primer-dia', '2026-11-30');
    expect(raiz.textContent).toContain('Cerrado');
    const sel = raiz.querySelector<HTMLSelectElement>('select')!;
    await act(() => {
      sel.value = '2026-12-07';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(raiz.querySelector('caption')?.textContent).toContain('07/12/2026');
  });

  it('una hora mal escrita en las semanas a guardar bloquea guardar', async () => {
    await montar();
    await pegar('EMP-01\t15:2O 22:10\tL\tL\tL\tL\tL\tL');
    expect(raiz.textContent).toContain('horas mal escritas');
    expect(boton('Guardar el horario de 1 semana').disabled).toBe(true);
  });

  it('un texto sin horas (V7R) no es error: ese día no trabaja', async () => {
    await montar();
    await pegar('EMP-01\tV7R\tL\tL\tL\tL\tL\tL');
    expect(raiz.textContent).toContain('No trabaja (V7R)');
    expect(boton('Guardar el horario de 1 semana').disabled).toBe(false);
  });

  it('edita una casilla de una semana guardada y puede quitarla', async () => {
    const almacen = await montar();
    await pegar(TABLA);
    await act(() => boton('Guardar el horario de 1 semana').click());
    await act(() => boton('Sí, guardar horario').click());
    expect(raiz.textContent).toContain('2 personas');
    await act(() => boton('Ver y editar').click());
    const celda = raiz.querySelector<HTMLInputElement>('input[aria-label="EMP-01, martes"]')!;
    expect(celda.value).toBe('15:45–22:00');
    await act(() => {
      celda.value = '10:3O 12';
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
      await act(() => boton('Guardar el horario de 1 semana').click());
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

  it('una petición del Cuadrante pone la semana pedida como primera a guardar y enfoca el título', async () => {
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar: () => ({ ok: true }) });
    raiz = document.createElement('div');
    document.body.appendChild(raiz);
    await act(() => render(<Horarios almacen={almacen} alIrASemana={() => {}} peticion={null} />, raiz));
    await act(() => render(<Horarios almacen={almacen} alIrASemana={() => {}} peticion={{ lunes: '2026-12-16', nonce: 1 }} />, raiz));
    expect(document.activeElement?.id).toBe('titulo-horarios');
    await pegar(anual(['10000001']));
    expect((raiz.querySelector('#hp-desde') as HTMLInputElement).value).toBe('2026-12-14');
    expect(raiz.textContent).toContain('Se guardarán 2 semanas.');
  });
});
