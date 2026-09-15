/**
 * src/main.ts
 * Bootstrap. Único ponto que instancia App e trata o ciclo de vida da página.
 */

import './style.css';
import { App } from './ui/App';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Elemento #app não encontrado em index.html');
}

const app = new App(root);

// Kiosk 24/7: garante cleanup se a página for recarregada/fechada,
// evitando AudioContext e listeners órfãos em navegadores que reciclam a view.
window.addEventListener('pagehide', () => app.destroy(), { once: true });
