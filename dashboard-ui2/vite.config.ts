import { defineConfig, loadEnv } from 'vite';
import solid from 'vite-plugin-solid';
import devtools from 'solid-devtools/vite';

export default ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, process.cwd());

  const backendTarget = `http://localhost:${env.VITE_DASHBOARD_PROXY_PORT}`;

  const viteConfig = defineConfig({
    plugins: [
      devtools({
        /* features options - all disabled by default */
        autoname: true, // e.g. enable autoname
        // pass `true` or an object with options
        locator: {
          targetIDE: 'vscode',
          componentLocation: true,
          jsxLocation: true,
        },
      }),
      solid(),
    ],
    server: {
      host: true,
      port: 5174,
      proxy: {
        '^/api/.*': {
          target: backendTarget,
          changeOrigin: true,
        },
        '^/cluster-api-proxy/.*': {
          target: backendTarget,
          ws: true,
          changeOrigin: true,
        },
        '^/graphql': {
          target: backendTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'esnext',
    },
  });

  return viteConfig;
};
