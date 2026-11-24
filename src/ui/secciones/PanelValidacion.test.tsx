// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import type { Incumplimiento, ResultadoValidacion } from '../../reglas/contrato';
import type { ResumenPersona, ResumenPuesto } from '../../validacion/resumen';
import { PanelValidacion } from './PanelValidacion';

let raiz: HTMLElement;
afterEach(() => {
  render(null, raiz);
  raiz.remove();
});

const datos = crearEstadoEjemplo();
const persona = datos.personas[0]!;
const area = datos.areas[0]!;
const puesto = datos.puestos[0]!;

function inc(campos: Partial<Incumplimiento>): Incumplimiento {
  return {
    reglaId: 'r', origen: 'general', tipo: 'sinSolapes', dura: true, penalizacion: 0, mensaje: 'Mensaje',
    marca: 'solape', fecha: null, personaId: null, asignacionIds: [], huecos: [], ...campos,
  };
}
const resultado = (incumplimientos: Incumplimiento[], semaforo: ResultadoValidacion['semaforo'] = 'rojo', pen = 0): ResultadoValidacion =>
  ({ semaforo, incumplimientos, penalizacionBlanda: pen });

const resumenPersona: ResumenPersona = {
  personaId: persona.id, minutosDia: [270, 0, 0, 0, 0, 0, 240], minutosSemana: 510, dias: 2,
  porArea: { [area.id]: 510 }, jornadaDomingo: { inicio: 600, fin: 840 }, objetivo: 600, desviacion: -90, avisos: 1,
};
const resumenPuesto: ResumenPuesto = { puestoId: puesto.id, huecos: 4, cubiertos: 3, porcentaje: 75 };

async function montar(res: ResultadoValidacion, alIr = vi.fn()) {
  raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(() =>
    render(
      <PanelValidacion resultado={res} resumen={{ personas: [resumenPersona], puestos: [resumenPuesto] }} datos={datos} alIr={alIr} />,
      raiz,
    ),
  );
  return alIr;
}
const boton = (t: string) => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('PanelValidacion', () => {
  it('muestra el semáforo verde con texto y region status', async () => {
    await montar(resultado([], 'verde'));
    const s = raiz.querySelector('[role=status]')!;
    expect(s.getAttribute('aria-live')).toBe('polite');
    expect(s.textContent).toContain('Todo correcto');
  });

  it('ámbar y rojo cuentan incumplimientos', async () => {
    await montar(resultado([inc({ dura: false }), inc({ dura: false })], 'ambar', 6));
    expect(raiz.querySelector('[role=status]')!.textContent).toContain('Solo preferencias sin cumplir (2)');
    expect(raiz.textContent).toContain('Penalización blanda total: 6');
    render(null, raiz);
    raiz.remove();
    await montar(resultado([inc({}), inc({ dura: false })]));
    expect(raiz.querySelector('[role=status]')!.textContent).toContain('1 incumplimiento obligatorio y 1 preferencia sin cumplir');
  });

  it('lista obligatorios primero, filtra y navega', async () => {
    const alIr = await montar(resultado([
      inc({ dura: false, mensaje: 'Blando' }),
      inc({ mensaje: 'Duro', asignacionIds: ['a1'] }),
      inc({ mensaje: 'Hueco', marca: 'hueco', huecos: ['h1'] }),
    ]));
    const mensajes = [...raiz.querySelectorAll('.pv-mensaje')].map((e) => e.textContent);
    expect(mensajes).toEqual(['Duro', 'Hueco', 'Blando']);
    expect(raiz.textContent).toContain('Sin cubrir');
    await act(() => boton('Duro').click());
    expect(alIr).toHaveBeenCalledWith({ asignacionId: 'a1' });
    await act(() => boton('Hueco').click());
    expect(alIr).toHaveBeenCalledWith({ hueco: 'h1' });
    await act(() => boton('Preferencias').click());
    expect([...raiz.querySelectorAll('.pv-mensaje')].map((e) => e.textContent)).toEqual(['Blando']);
  });

  it('agrupa por tipo', async () => {
    await montar(resultado([inc({}), inc({})]));
    await act(() => raiz.querySelector<HTMLInputElement>('.pv-agrupar input')!.click());
    expect(raiz.querySelectorAll('.pv-grupo')).toHaveLength(1);
  });

  it('limita a 50 y permite mostrar todos', async () => {
    await montar(resultado(Array.from({ length: 60 }, () => inc({}))));
    expect(raiz.querySelectorAll('.pv-incumplimiento')).toHaveLength(50);
    await act(() => boton('Mostrar todos').click());
    expect(raiz.querySelectorAll('.pv-incumplimiento')).toHaveLength(60);
  });

  it('tabla por persona con horas, desviación y th scope', async () => {
    await montar(resultado([], 'verde'));
    const fila = raiz.querySelector('tbody tr')!;
    expect(fila.querySelector('th[scope=row]')!.textContent).toBe(persona.alias ? `${persona.codigo} (${persona.alias})` : persona.codigo);
    const texto = fila.textContent!;
    expect(texto).toContain('4h30');
    expect(texto).toContain('8h30');
    expect(texto).toContain('10:00–14:00');
    expect(texto).toContain('−1h30 de menos');
    expect(raiz.querySelectorAll('thead th[scope=col]').length).toBeGreaterThan(10);
  });

  it('cobertura por puesto con barra y porcentaje en texto', async () => {
    await montar(resultado([], 'verde'));
    await act(() => boton('Cobertura por puesto').click());
    const fila = raiz.querySelector('tbody tr')!;
    expect(fila.textContent).toContain('3 / 4');
    expect(fila.textContent).toContain('75 %');
    expect(fila.textContent).toContain(area.nombre);
  });

  it('las pestañas de resumen se mueven con flechas, Inicio y Fin y gestionan tabIndex', async () => {
    await montar(resultado([], 'verde'));
    const tabs = () => [...raiz.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
    const tecla = (el: HTMLElement, key: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    await tecla(tabs()[0]!, 'ArrowRight');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0]);
    await tecla(tabs()[1]!, 'Home');
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    await tecla(tabs()[0]!, 'End');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('un incumplimiento no navegable usa aria-disabled, sigue tabulable y no hace nada', async () => {
    const alIr = await montar(resultado([inc({ mensaje: 'Suelto' })]));
    const b = boton('Suelto');
    expect(b.disabled).toBe(false);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    await act(() => b.click());
    expect(alIr).not.toHaveBeenCalled();
  });
});
