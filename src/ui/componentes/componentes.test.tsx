// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import type { DatosPlanificacion, DiaSemana, Dureza, FranjaComida, Minutos } from '../../modelo/tipos';
import type { CampoParam } from '../../reglas/metadatos';
import { CampoDuracion, CampoHora, SelectorDias, SelectorDureza } from './campos';
import { Confirmacion } from './Confirmacion';
import { EditorParams } from './EditorParams';

async function montar(vista: preact.VNode) {
  const raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(() => render(vista, raiz));
  return raiz;
}

describe('CampoHora', () => {
  it('lee «930» al salir del campo', async () => {
    const onCambio = vi.fn();
    const raiz = await montar(<CampoHora id="h" etiqueta="Inicio" valor={600} onCambio={onCambio} />);
    const input = raiz.querySelector<HTMLInputElement>('#h')!;
    await act(() => {
      input.value = '930';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => {
      input.dispatchEvent(new FocusEvent('blur'));
    });
    expect(onCambio).toHaveBeenCalledWith(570);
    expect(input.value).toBe('09:30');
  });
  it('muestra error si no se entiende', async () => {
    const onCambio = vi.fn();
    const raiz = await montar(<CampoHora id="h" etiqueta="Inicio" valor={600} onCambio={onCambio} />);
    const input = raiz.querySelector<HTMLInputElement>('#h')!;
    await act(() => {
      input.value = '25:00';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => {
      input.dispatchEvent(new FocusEvent('blur'));
    });
    expect(onCambio).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(raiz.querySelector('#h-error')).not.toBeNull();
  });
});

describe('SelectorDias', () => {
  it('marca y desmarca días', async () => {
    const onCambio = vi.fn();
    const raiz = await montar(<SelectorDias id="d" leyenda="Días" valor={[0, 2] as DiaSemana[]} onCambio={onCambio} />);
    expect(raiz.querySelector('legend')!.textContent).toBe('Días');
    expect(raiz.querySelectorAll('input[type=checkbox]')).toHaveLength(7);
    await act(() => raiz.querySelector<HTMLInputElement>('#d-1')!.click());
    expect(onCambio).toHaveBeenLastCalledWith([0, 1, 2]);
    await act(() => raiz.querySelector<HTMLInputElement>('#d-0')!.click());
    expect(onCambio).toHaveBeenLastCalledWith([2]);
  });
});

describe('SelectorDureza', () => {
  it('blanda muestra el peso y dura lo oculta', async () => {
    const onCambio = vi.fn();
    const raiz = await montar(<SelectorDureza id="z" valor={{ dura: false, peso: 5 }} onCambio={onCambio} />);
    expect(raiz.querySelector('#z-peso')).not.toBeNull();
    await act(() => raiz.querySelector<HTMLInputElement>('#z-dura')!.click());
    expect(onCambio).toHaveBeenLastCalledWith({ dura: true, peso: 5 });
  });
  it('soloDura deshabilita la blanda', async () => {
    const raiz = await montar(<SelectorDureza id="z" valor={{ dura: false, peso: 5 } as Dureza} onCambio={() => {}} restringir="soloDura" />);
    expect(raiz.querySelector<HTMLInputElement>('#z-blanda')!.disabled).toBe(true);
    expect(raiz.querySelector('#z-peso')).toBeNull();
  });
});

interface ParamsComida {
  dias: DiaSemana[];
  umbralJornadaMin: Minutos;
  duracionMin: Minutos;
  franjas: FranjaComida[];
}
const campos: CampoParam<ParamsComida>[] = [
  { clave: 'dias', etiqueta: 'Días', tipo: 'dias' },
  { clave: 'umbralJornadaMin', etiqueta: 'Jornada a partir de', tipo: 'duracion', min: 1 },
  { clave: 'duracionMin', etiqueta: 'Duración de la comida', tipo: 'duracion', min: 1 },
  { clave: 'franjas', etiqueta: 'Franjas de comida', tipo: 'franjasComida' },
];

describe('EditorParams', () => {
  const datos: DatosPlanificacion = crearEstadoEjemplo();
  const valor: ParamsComida = { dias: [0, 1], umbralJornadaMin: 360, duracionMin: 45, franjas: [{ inicio: 780, fin: 870, maxPersonas: 2 }] };

  it('pinta un control por campo y propaga cambios', async () => {
    const onCambio = vi.fn();
    const raiz = await montar(<EditorParams campos={campos} valor={valor} onCambio={onCambio} datos={datos} idBase="r" />);
    expect(raiz.querySelector<HTMLInputElement>('#r-umbralJornadaMin')!.value).toBe('6h');
    expect(raiz.querySelector<HTMLInputElement>('#r-duracionMin')!.value).toBe('45 min');
    expect(raiz.querySelector<HTMLInputElement>('#r-franjas-0-inicio')!.value).toBe('13:00');
    await act(() => raiz.querySelector<HTMLInputElement>('#r-dias-2')!.click());
    expect(onCambio).toHaveBeenLastCalledWith({ ...valor, dias: [0, 1, 2] });
    const botones = [...raiz.querySelectorAll('button')];
    await act(() => botones.find((b) => b.textContent === 'Añadir franja')!.click());
    expect(onCambio).toHaveBeenLastCalledWith({ ...valor, franjas: [...valor.franjas, { inicio: 870, fin: 930, maxPersonas: 1 }] });
    await act(() => botones.find((b) => b.textContent === 'Quitar franja 1')!.click());
    expect(onCambio).toHaveBeenLastCalledWith({ ...valor, franjas: [] });
  });

  it('anulable muestra «Sin límite»', async () => {
    const onCambio = vi.fn();
    const c: CampoParam<{ max: number | null }>[] = [{ clave: 'max', etiqueta: 'Máximo', tipo: 'duracion', anulable: true, min: 1 }];
    const raiz = await montar(<EditorParams campos={c} valor={{ max: 270 }} onCambio={onCambio} datos={datos} idBase="a" />);
    await act(() => raiz.querySelector<HTMLInputElement>('#a-max-sinlimite')!.click());
    expect(onCambio).toHaveBeenLastCalledWith({ max: null });
  });
});

const escribirTexto = (input: HTMLInputElement, texto: string) =>
  act(() => {
    input.value = texto;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('onValidez y Enter', () => {
  it('CampoHora avisa false en cada cambio no válido y true al corregir', async () => {
    const onValidez = vi.fn();
    const raiz = await montar(<CampoHora id="v" etiqueta="Inicio" valor={600} onCambio={() => {}} onValidez={onValidez} />);
    const input = raiz.querySelector<HTMLInputElement>('#v')!;
    await escribirTexto(input, 'xx');
    expect(onValidez).toHaveBeenLastCalledWith(false);
    await escribirTexto(input, '9:30');
    expect(onValidez).toHaveBeenLastCalledWith(true);
  });

  it('CampoDuracion: Enter confirma y un texto inválido muestra el motivo', async () => {
    const onCambio = vi.fn();
    const onValidez = vi.fn();
    const raiz = await montar(<CampoDuracion id="d" etiqueta="Máx." valor={60} onCambio={onCambio} onValidez={onValidez} />);
    const input = raiz.querySelector<HTMLInputElement>('#d')!;
    await escribirTexto(input, '2h');
    await act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onCambio).toHaveBeenCalledWith(120);
    await escribirTexto(input, 'abc');
    expect(onValidez).toHaveBeenLastCalledWith(false);
    await act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(raiz.querySelector('#d-error')!.textContent).toContain('4h30');
  });

  it('EditorParams es inválido mientras un campo interno no se entiende', async () => {
    const onValidez = vi.fn();
    const c: CampoParam<{ umbral: number }>[] = [{ clave: 'umbral', etiqueta: 'Umbral', tipo: 'duracion', min: 1 }];
    const raiz = await montar(<EditorParams campos={c} valor={{ umbral: 60 }} onCambio={() => {}} datos={crearEstadoEjemplo()} idBase="e" onValidez={onValidez} />);
    const input = raiz.querySelector<HTMLInputElement>('#e-umbral')!;
    await escribirTexto(input, '???');
    expect(onValidez).toHaveBeenLastCalledWith(false);
    await escribirTexto(input, '1h');
    expect(onValidez).toHaveBeenLastCalledWith(true);
  });
});

describe('Confirmacion', () => {
  it('devuelve el foco al elemento que lo tenía al abrirse', async () => {
    const raiz = document.createElement('div');
    document.body.appendChild(raiz);
    const disparador = document.createElement('button');
    document.body.appendChild(disparador);
    disparador.focus();
    await act(() => render(<Confirmacion id="c" titulo="t" texto="x" textoConfirmar="Sí" alConfirmar={() => {}} alCancelar={() => {}} />, raiz));
    expect(document.activeElement?.textContent).toBe('Cancelar');
    await act(() => render(null, raiz));
    expect(document.activeElement).toBe(disparador);
  });
});
