// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import type { TablaExportada } from '../../exportar/excel';
import { estadoConAsignaciones } from '../../../tests/ayudas/datosPrueba';
import type { EstadoApp } from '../../modelo/tipos';
import { CopiarExcel } from './CopiarExcel';

async function montar(
  copiar: (t: TablaExportada) => Promise<{ ok: true } | { ok: false; error: string }>,
  estado: EstadoApp = crearEstadoEjemplo(),
  lunes = '2026-11-30',
) {
  const raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(() => render(<CopiarExcel estado={estado} lunes={lunes} copiar={copiar} />, raiz));
  return raiz;
}
const boton = (raiz: HTMLElement, texto: string) => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;

describe('CopiarExcel', () => {
  it('el panel está cerrado hasta pulsar el botón', async () => {
    const raiz = await montar(vi.fn());
    expect(raiz.querySelector('table')).toBeNull();
    await act(() => boton(raiz, 'Copiar para Excel').click());
    expect(raiz.querySelector('table')).not.toBeNull();
    expect((raiz.querySelector('#copiar-sin-alias') as HTMLInputElement).checked).toBe(true);
    expect((raiz.querySelector('#copiar-disposicion') as HTMLSelectElement).value).toBe('diasEnColumnas');
  });

  it('copia la tabla del formato elegido y avisa', async () => {
    const copiar = vi.fn().mockResolvedValue({ ok: true });
    const raiz = await montar(copiar, estadoConAsignaciones(), '2026-11-23');
    await act(() => boton(raiz, 'Copiar para Excel').click());
    await act(() => (raiz.querySelector('#copiar-formato-plano') as HTMLInputElement).click());
    expect(raiz.querySelector('#copiar-area')).toBeNull();
    await act(async () => boton(raiz, 'Copiar').click());
    expect((copiar.mock.calls[0]![0] as TablaExportada).filas[0]![0]).toBe('Fecha');
    expect(raiz.querySelector('[role="status"]')!.textContent).toBe('Copiado: pégalo en Excel con Ctrl+V');
  });

  it('muestra el error si la copia falla', async () => {
    const raiz = await montar(vi.fn().mockResolvedValue({ ok: false, error: 'No se ha podido copiar.' }), estadoConAsignaciones(), '2026-11-23');
    await act(() => boton(raiz, 'Copiar para Excel').click());
    await act(async () => boton(raiz, 'Copiar').click());
    expect(raiz.querySelector('[role="status"]')!.textContent).toBe('No se ha podido copiar.');
  });

  it('sin nada que copiar avisa y desactiva «Copiar»', async () => {
    const raiz = await montar(vi.fn());
    await act(() => boton(raiz, 'Copiar para Excel').click());
    await act(() => (raiz.querySelector('#copiar-formato-plano') as HTMLInputElement).click());
    expect(raiz.textContent).toContain('Esta semana no tiene nada que copiar en este formato.');
    expect(boton(raiz, 'Copiar').disabled).toBe(true);
  });

  it('sin áreas activas no ofrece «Por área»', async () => {
    const e = crearEstadoEjemplo();
    const raiz = await montar(vi.fn(), { ...e, areas: e.areas.map((a) => ({ ...a, activa: false })) });
    await act(() => boton(raiz, 'Copiar para Excel').click());
    expect(raiz.querySelector('#copiar-formato-area')).toBeNull();
    expect(raiz.querySelector('#copiar-formato-persona')).not.toBeNull();
    expect((raiz.querySelector('#copiar-formato-persona') as HTMLInputElement).checked).toBe(true);
  });
});
