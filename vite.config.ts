import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: funciona tanto na raiz de um domínio próprio quanto
  // no subcaminho de um GitHub Pages de projeto (usuario.github.io/repo/),
  // sem precisar saber o nome do repositório de antemão.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
