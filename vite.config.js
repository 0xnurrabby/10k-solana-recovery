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
        proxyReq.removeHeader('cookie');
        proxyReq.removeHeader('authorization');
      });
    },
  },
  '/solana-rpc': {
    target: 'https://mainnet.helius-rpc.com',
    changeOrigin: true,
    secure: true,
    rewrite: () => '/?api-key=14fb606d-9e4a-4943-a82f-ff7b34d1b708',
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('origin');
        proxyReq.removeHeader('referer');
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
