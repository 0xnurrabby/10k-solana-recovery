import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const proxyConfig = {
  '/privy-auth': {
    target: 'https://auth.privy.io',
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/privy-auth/, ''),
    headers: {
      origin: 'https://10k.world',
      referer: 'https://10k.world/',
    },
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('origin', 'https://10k.world');
        proxyReq.setHeader('referer', 'https://10k.world/');
        proxyReq.setHeader('host', 'auth.privy.io');
      });
    },
  },
};

export default defineConfig({
  plugins: [
    basicSsl(),
    react(),
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  server: {
    port: 443,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: proxyConfig,
  },
  preview: {
    port: 443,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: proxyConfig,
  },
});
