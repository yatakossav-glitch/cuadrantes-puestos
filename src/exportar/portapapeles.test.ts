// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copiarTabla } from './portapapeles';

const tabla = { titulo: 't', filas: [['A', 'B'], ['1', '2']] };

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'execCommand');
});

describe('copiarTabla', () => {
  it('usa navigator.clipboard.write con html y texto', async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    const tipos: Record<string, Blob>[] = [];
    vi.stubGlobal('ClipboardItem', class { constructor(d: Record<string, Blob>) { tipos.push(d); } });
    vi.stubGlobal('navigator', { clipboard: { write: escribir } });
    vi.stubGlobal('isSecureContext', true);
    expect(await copiarTabla(tabla)).toEqual({ ok: true });
    expect(escribir).toHaveBeenCalledOnce();
    expect(Object.keys(tipos[0]!).sort()).toEqual(['text/html', 'text/plain']);
  });

  it('si la API falla, recurre al evento copy', async () => {
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('navigator', { clipboard: { write: vi.fn().mockRejectedValue(new Error('no')) } });
    const datos: Record<string, string> = {};
    document.execCommand = vi.fn(() => {
      const e = new Event('copy', { cancelable: true }) as Event & { clipboardData: unknown };
      e.clipboardData = { setData: (t: string, v: string) => { datos[t] = v; } };
      document.dispatchEvent(e);
      return true;
    });
    expect(await copiarTabla(tabla)).toEqual({ ok: true });
    expect(datos['text/plain']).toBe('A\tB\n1\t2');
    expect(datos['text/html']).toContain('<table');
  });

  it('sin API usa el evento copy', async () => {
    vi.stubGlobal('navigator', {});
    const datos: Record<string, string> = {};
    document.execCommand = vi.fn(() => {
      const e = new Event('copy', { cancelable: true }) as Event & { clipboardData: unknown };
      e.clipboardData = { setData: (t: string, v: string) => { datos[t] = v; } };
      document.dispatchEvent(e);
      return true;
    });
    expect((await copiarTabla(tabla)).ok).toBe(true);
    expect(Object.keys(datos).sort()).toEqual(['text/html', 'text/plain']);
  });

  it('devuelve un error en español si todo falla, sin lanzar', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn(() => { throw new Error('bloqueado'); });
    const r = await copiarTabla(tabla);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No se ha podido copiar/);
  });
});
