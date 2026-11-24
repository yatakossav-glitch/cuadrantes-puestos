import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { CATALOGO } from '../reglas/catalogo';
import { crearIndice } from '../validacion/indice';
import { explicarUnidad, nombreParaMensaje, resumenSinCubrir } from './explicaciones';
import { crearComprobador, crearUnidades } from './unidades';
import { personasActivas } from './construccion';

const LUNES = '2026-11-23';
const P = IDS_EJEMPLO.puestos;

describe('explicaciones', () => {
  const datos = crearEstadoEjemplo();
  const indice = crearIndice(datos, LUNES, []);
  const unidades = crearUnidades(datos, indice, new Set());
  const pedidosTarde = unidades.find((u) => u.puestoId === P.pedidos && u.fecha === '2026-11-26' && u.inicio === 945)!;
  const caja = unidades.find((u) => u.puestoId === P.caja1 && u.fecha === '2026-11-26' && u.inicio === 600)!;

  it('nombra el área si es el único puesto, y el puesto si hay varios', () => {
    expect(nombreParaMensaje(datos, datos.puestos.find((p) => p.id === P.pedidos))).toBe('Pedidos Web');
    expect(nombreParaMensaje(datos, datos.puestos.find((p) => p.id === P.caja1))).toBe('Caja 1');
    expect(nombreParaMensaje(datos, undefined)).toBe('un puesto desconocido');
  });

  it('redacta el resumen con puesto, día y hora', () => {
    expect(resumenSinCubrir(datos, pedidosTarde)).toBe('Nadie disponible para Pedidos Web el jueves 26/11 15:45–22:00');
    expect(resumenSinCubrir(datos, caja)).toBe('Nadie disponible para Caja 1 el jueves 26/11 10:00–13:00');
  });

  it('da una explicación por hueco con el primer motivo duro de cada persona descartada', () => {
    const personas = personasActivas(datos);
    const exp = explicarUnidad(datos, crearComprobador(datos, CATALOGO), indice, caja, personas);
    expect(exp).toHaveLength(2);
    expect(exp[0]?.hueco.franjaId).toBe('franja-caja-1');
    expect(exp[1]?.hueco.franjaId).toBe('franja-caja-2');
    const descartes = exp[0]!.descartes;
    // Descartadas: las que no son del equipo de mañana o no tienen Caja, más EMP-08 (solo fines de semana), etc.
    expect(descartes.length).toBeGreaterThan(0);
    expect(descartes.length).toBeLessThan(personas.length);
    for (const d of descartes) {
      const codigo = datos.personas.find((p) => p.id === d.personaId)!.codigo;
      expect(d.motivo).toContain(codigo);
    }
    expect(descartes.some((d) => d.personaId === 'per-08')).toBe(true);
  });

  it('sin personas activas lo dice claramente', () => {
    const exp = explicarUnidad(datos, crearComprobador(datos, CATALOGO), indice, pedidosTarde, []);
    expect(exp[0]?.resumen).toContain('No hay personas activas');
    expect(exp[0]?.descartes).toEqual([]);
  });
});
