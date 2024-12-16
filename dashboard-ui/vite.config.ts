/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, loadEnv, splitVendorChunkPlugin } from 'vite';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  const backendTarget = `http://localhost:${env.VITE_DASHBOARD_PROXY_PORT}`;

  return defineConfig({
    plugins: [
      tsconfigPaths(),
      svgr(),
      splitVendorChunkPlugin(),
      react(),
      visualizer(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      proxy: {
        '^/api/auth/.*': {
          target: backendTarget,
        },
        '^/csrf-token': {
          target: backendTarget,
        },
        '^/graphql': {
          target: backendTarget,
          ws: true,
        },
        '^/kubetail-api': {
          target: backendTarget,
          ws: true,
        },
      }
    },
    build: {
      manifest: true,
      sourcemap: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./vitest.setup.ts']
    }  
  });
};
