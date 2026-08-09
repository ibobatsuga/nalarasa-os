import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
/** Backend bisa dipindah saat :3000 dipakai proses lain. */
const API = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5176, proxy: { '/api': { target: API, rewrite: (p) => p.replace(/^\/api/, '') } } },
});
