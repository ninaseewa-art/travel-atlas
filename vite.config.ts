import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (key?.startsWith('sb_secret_'))
    throw new Error('Only public Supabase keys are allowed in VITE_SUPABASE_ANON_KEY');
  if (key?.split('.').length === 3) {
    let role;
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    } catch {
      /* non-JWT keys are validated by Supabase */
    }
    if (role === 'service_role') throw new Error('Never expose a service_role key in the frontend');
  }
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        manifest: {
          name: 'Наш атлас',
          short_name: 'Наш атлас',
          description: 'Наши места на одной планете',
          lang: 'ru',
          start_url: '/',
          display: 'standalone',
          background_color: '#f8f7f2',
          theme_color: '#f8f7f2',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2,geojson,txt}'],
          globIgnores: ['**/ocr/**'],
          maximumFileSizeToCacheInBytes: 5000000,
          navigateFallbackDenylist: [/^\/auth/],
          runtimeCaching: [],
        },
      }),
    ],
    preview: {
      headers: {
        'Content-Security-Policy': readFileSync(
          new URL('./public/_headers', import.meta.url),
          'utf8',
        ).match(/Content-Security-Policy: (.+)/)![1],
      },
    },
    build: { chunkSizeWarningLimit: 1800 },
  };
});
