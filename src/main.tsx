import { render } from 'preact';
import './ui/estilos.css';
import { obtenerAlmacenNavegador } from './persistencia/almacen';
import { crearEstadoEjemplo } from './datos-ejemplo/ejemplo';
import { prepararArranque } from './arranque';
import { crearAlmacenApp } from './ui/estado';
import { App } from './ui/App';

const arranque = prepararArranque(obtenerAlmacenNavegador(), crearEstadoEjemplo);
const almacenBase = crearAlmacenApp(arranque.inicial, { guardar: arranque.guardar });

const almacen: typeof almacenBase = {
  ...almacenBase,
  reemplazar(descripcion, estado) {
    arranque.alReemplazar();
    almacenBase.reemplazar(descripcion, estado);
  },
};

const raiz = document.getElementById('app');
if (raiz) {
  render(
    <App
      almacen={almacen}
      avisosCarga={arranque.avisosCarga}
      avisoArranque={arranque.avisoArranque}
      textoIlegible={arranque.textoIlegible}
    />,
    raiz,
  );
}
