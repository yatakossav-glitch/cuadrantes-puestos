import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PeticionMotor, ProgresoMotor, ResultadoMotor } from '../motor/contrato';

const generar = vi.fn();

vi.mock('../motor/motor', () => ({ motor: { generar: (...a: unknown[]) => generar(...a), sugerir: () => [] }, MAX_ITERACIONES_POR_DEFECTO: 800 }));
// Simula un entorno sin Worker: crear el trabajador lanza.
vi.mock('../motor/trabajador?worker&inline', () => ({
  default: class {
    constructor() {
      throw new Error('Worker no disponible');
    }
  },
}));

const { ejecutarMotor, MotorCancelado } = await import('./usarMotor');

const peticion = { modo: 'completarHuecos', semilla: 1, lunes: '2026-11-23' } as unknown as PeticionMotor;
const resultado: ResultadoMotor = { asignaciones: [], sinCubrir: [], comidasPendientes: [], penalizacionBlanda: 0, iteraciones: 3, ms: 1, cortadoPorTiempo: false };

afterEach(() => {
  generar.mockReset();
  vi.unstubAllGlobals();
});

describe('ejecutarMotor sin Worker (hilo principal)', () => {
  it('ejecuta el motor, informa del progreso y devuelve el resultado', async () => {
    vi.stubGlobal('Worker', undefined);
    const progreso: ProgresoMotor = { fase: 'mejora', fraccion: 0.5, huecosSinCubrir: 2, penalizacionBlanda: 4 };
    generar.mockImplementation((_p: PeticionMotor, alProgresar: (p: ProgresoMotor) => void) => {
      alProgresar(progreso);
      return resultado;
    });
    const vistos: ProgresoMotor[] = [];
    const { promesa } = ejecutarMotor(peticion, (p) => vistos.push(p));
    expect(generar).not.toHaveBeenCalled(); // cede antes de empezar
    await expect(promesa).resolves.toBe(resultado);
    expect(vistos).toEqual([progreso]);
    expect(generar.mock.calls[0]?.[0]).toBe(peticion);
  });

  it('cancelar antes de empezar rechaza con MotorCancelado y no ejecuta el motor', async () => {
    const { promesa, cancelar } = ejecutarMotor(peticion, () => {});
    cancelar();
    await expect(promesa).rejects.toBeInstanceOf(MotorCancelado);
    await new Promise((r) => setTimeout(r, 5));
    expect(generar).not.toHaveBeenCalled();
  });

  it('un fallo del motor rechaza con un mensaje en español', async () => {
    generar.mockImplementation(() => {
      throw new Error('datos incoherentes');
    });
    const { promesa } = ejecutarMotor(peticion, () => {});
    await expect(promesa).rejects.toThrow('No se pudo generar el cuadrante (datos incoherentes).');
  });
});
