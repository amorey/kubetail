import react from '@vitejs/plugin-react-swc';
import { defineConfig, loadEnv } from 'vite';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

export default ({ mode }: { mode: string; }) => {
  const env = loadEnv(mode, process.cwd());

  const backendTarget = `http://localhost:${env.VITE_DASHBOARD_PROXY_PORT}`;
  console.log(backendTarget);

  return defineConfig({
    plugins: [
      tsconfigPaths(),
      svgr(),
      react(),
    ],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
      ],
    },
    build: {
      manifest: true,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('/node_modules/')) return 'vendor';
          },
        },
      },
    },
  });
};
