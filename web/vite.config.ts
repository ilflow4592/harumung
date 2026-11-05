import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// 카메라(getUserMedia)는 https 또는 localhost에서만 열린다.
// 폰에서 테스트할 때는 `npm run dev -- --host`로 띄우고 https://<맥 IP>:5173 으로 접속한다.
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: '하루멍',
        short_name: '하루멍',
        description: '찍는 순간 이름이 붙고, 저녁엔 보호자에게 아이의 하루가 도착하는 앱',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: '#0B7A6B',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // 앱 셸만 캐시한다. 사진·영상·API는 캐시하지 않는다.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/v1\//, /^\/a\//, /^\/actuator\//],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/v1': 'http://localhost:8080',
      '/a': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
