import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load environment variables from .env files
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Base path for deploying under subpath
    base: env.VITE_BASE_PATH || '/grace-packing-helper',

    // Dev server configuration
    server: {
      port: 3000,
      host: '0.0.0.0', // LAN accessible
    },

    // Plugins
    plugins: [react()],

    // Define env variables for use in code
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },

    // Path aliasing
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'), // @ points to project root
      },
    },

    // Optional: build config
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
