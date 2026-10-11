import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app talks to the PHP server (php -S localhost:8000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
