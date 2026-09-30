import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// The browser only ever talks to this origin. /api, /auth and /admin are proxied to Express,
// so session cookies are first-party and OAuth redirect URIs point at the same host.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_PROXY_TARGET || 'http://localhost:4000';
  const proxy = { target, changeOrigin: false, xfwd: true };
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: 5173,
      // Allow tunnels (Slack requires an https redirect URL in development) plus any extra host in env.
      allowedHosts: ['localhost', '.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev', '.ngrok.io', '.trycloudflare.com', ...(env.ALLOWED_HOSTS ? env.ALLOWED_HOSTS.split(',') : [])],
      proxy: { '/api': proxy, '/auth': proxy, '/admin': proxy },
    },
  };
});
