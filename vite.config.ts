import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const busmapsApiKey = env.VITE_BUSMAPS_API_KEY || '';
  const busmapsHost = env.VITE_BUSMAPS_HOST || 'wikiroutes.info';

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
      include: ['three'],
    },
    assetsInclude: ['**/*.glb', '**/*.gltf'],
    server: {
      proxy: {
        '/api/busmaps': {
          target: 'https://capi.busmaps.com:8443',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/busmaps/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (busmapsApiKey) {
                const normalized = busmapsApiKey.startsWith('Bearer ')
                  ? busmapsApiKey
                  : `Bearer ${busmapsApiKey}`;
                proxyReq.setHeader('capi-key', normalized);
              }
              proxyReq.setHeader('capi-host', busmapsHost);
            });
          },
        },
      },
    },
  };
});
