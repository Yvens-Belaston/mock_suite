import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Screens are served by Fastify under /ui/; the Vite project lives in web/.
export default defineConfig({
  root: 'web',
  base: '/ui/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
