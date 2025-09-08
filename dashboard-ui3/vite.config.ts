import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal Vite config for a tiny React app.
export default ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, process.cwd());
  const backendTarget = `http://localhost:${env.VITE_DASHBOARD_PROXY_PORT}`;

  return defineConfig({
    plugins: [react()],
    build: {
      target: 'es2020',
      sourcemap: false,
      cssMinify: true,
      minify: 'esbuild',
    },
    server: {
      port: 5175,
      host: true,
      proxy: {
        '^/api/.*': { target: backendTarget },
        '^/cluster-api-proxy/.*': { target: backendTarget, ws: true },
        '^/graphql': { target: backendTarget, ws: true },
      },
    },
  });
};
