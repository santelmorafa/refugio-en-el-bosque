import { defineConfig } from 'vite';

// El proyecto sirve /public (models, textures) de forma estática.
// base: '/' => despliegue en la raíz del dominio (Vercel). Los assets se
// referencian con rutas absolutas desde la raíz y funcionan en producción.
export default defineConfig({
  base: '/',
  server: {
    host: true,
    port: 5173,
    open: true,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,          // build de producción más ligero
    chunkSizeWarningLimit: 1500, // three.js es grande; aviso innecesario
  },
});
