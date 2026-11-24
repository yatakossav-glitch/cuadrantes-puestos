/** Iconos SVG de línea propios (24x24, trazo 1,75, `currentColor`), pintados a 16 px. */
import type { ComponentChildren, JSX } from 'preact';
import type { IconoArea } from '../modelo/tipos';

export interface PropsIcono {
  tamano?: number;
  class?: string;
}

function Base({ tamano = 16, class: clase, children }: PropsIcono & { children: ComponentChildren }) {
  return (
    <svg
      class={clase ? `icono ${clase}` : 'icono'}
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconoCaja = (p: PropsIcono) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
    <path d="M7 14h4" />
  </Base>
);
export const IconoPaquete = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5 12 12l8-4.5" />
    <path d="M12 12v9" />
  </Base>
);
export const IconoBloques = (p: PropsIcono) => (
  <Base {...p}>
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <rect x="8" y="3" width="8" height="8" rx="1" />
  </Base>
);
export const IconoLibro = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M12 6c-2-1.5-4.500-2-8-2v14c3.500 0 6 .5 8 2 2-1.500 4.500-2 8-2V4c-3.500 0-6 .5-8 2z" />
    <path d="M12 6v14" />
  </Base>
);
export const IconoTienda = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M4 9 5.500 4h13L20 9" />
    <path d="M4 9a2.700 2.700 0 0 0 5.300 0 2.700 2.700 0 0 0 5.400 0A2.700 2.700 0 0 0 20 9" />
    <path d="M5 11.500V20h14v-8.500" />
    <path d="M10 20v-5h4v5" />
  </Base>
);
export const IconoEtiqueta = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M3 12V4h8l10 10-8 8z" />
    <circle cx="7.500" cy="8.500" r="1.200" />
  </Base>
);
export const IconoReloj = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.500 2" />
  </Base>
);
export const IconoUsuarios = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.500" />
    <path d="M2.500 20c.5-3.500 3-5.500 6.500-5.500s6 2 6.500 5.500" />
    <path d="M16 4.700a3.500 3.500 0 0 1 0 6.600" />
    <path d="M18 14.800c2 .7 3.200 2.500 3.500 5.200" />
  </Base>
);
export const IconoCandado = (p: PropsIcono) => (
  <Base {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    <path d="M12 15v2" />
  </Base>
);
export const IconoAviso = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M12 3 22 20H2z" />
    <path d="M12 10v4.500" />
    <path d="M12 17.200v.100" />
  </Base>
);
export const IconoAusencia = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.600 5.600 18.400 18.400" />
  </Base>
);
export const IconoComida = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M7 3v8" />
    <path d="M4 3v5a3 3 0 0 0 6 0V3" />
    <path d="M7 11v10" />
    <path d="M17 21V3c-2.500 1.500-3.500 4-3.500 7.500V14H17" />
  </Base>
);
export const IconoDeshacer = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Base>
);
export const IconoRehacer = (p: PropsIcono) => (
  <Base {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Base>
);
export const IconoCopiar = (p: PropsIcono) => (
  <Base {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </Base>
);
export const IconoImportar = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Base>
);
export const IconoExportar = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M12 15V3" />
    <path d="m7 8 5-5 5 5" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Base>
);
export const IconoCuadrante = (p: PropsIcono) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 10h18" />
    <path d="M9 10v11" />
    <path d="M15 10v11" />
    <path d="M3 15.500h18" />
  </Base>
);
export const IconoPersona = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.500 21c.5-4 3.500-6.500 7.500-6.500s7 2.500 7.500 6.500" />
  </Base>
);
export const IconoPuesto = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M12 21s-7-6-7-11.500a7 7 0 0 1 14 0C19 15 12 21 12 21z" />
    <circle cx="12" cy="9.500" r="2.500" />
  </Base>
);
export const IconoReglas = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M4 7h10" />
    <path d="M18 7h2" />
    <circle cx="16" cy="7" r="2" />
    <path d="M4 17h2" />
    <path d="M10 17h10" />
    <circle cx="8" cy="17" r="2" />
  </Base>
);
export const IconoRotacion = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M20 12a8 8 0 0 1-14 5.300" />
    <path d="M4 12a8 8 0 0 1 14-5.300" />
    <path d="M18 3v4h-4" />
    <path d="M6 21v-4h4" />
  </Base>
);
export const IconoCalendario = (p: PropsIcono) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M8 14h2" />
    <path d="M14 14h2" />
    <path d="M8 17.500h2" />
  </Base>
);

const POR_AREA: Record<IconoArea, (p: PropsIcono) => JSX.Element> = {
  caja: IconoCaja,
  paquete: IconoPaquete,
  bloques: IconoBloques,
  libro: IconoLibro,
  tienda: IconoTienda,
  etiqueta: IconoEtiqueta,
  reloj: IconoReloj,
  usuarios: IconoUsuarios,
};

/** Icono de un área según su `IconoArea`. */
export function IconoDeArea({ icono, ...p }: PropsIcono & { icono: IconoArea }) {
  const Componente = POR_AREA[icono];
  return <Componente {...p} />;
}
