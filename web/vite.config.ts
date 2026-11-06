import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// 카메라(getUserMedia)는 https 또는 localhost에서만 열린다.
// 폰에서 테스트할 때는 `npm run dev -- --host`로 띄우고 https://<맥 IP>:5173 으로 접속한다.
// 배포 기준 경로. GitHub Pages는 /harumung/ 하위에 뜬다 (워크플로에서 VITE_BASE로 지정). 로컬은 /.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-192-maskable.png', 'icon-512-maskable.png', 'apple-touch-icon.png', 'favicon-32.png', 'favicon-64.png', 'logo-face-128.png'],
      manifest: {
        name: '하루멍',
        short_name: '하루멍',
        description: '찍는 순간 이름이 붙고, 저녁엔 보호자에게 아이의 하루가 도착하는 앱',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FDD963',
        theme_color: '#C9641B',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 셸만 캐시한다. 사진·영상·API는 캐시하지 않는다.
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2}'],
        navigateFallbackDenylist: [/^\/v1\//, /^\/a\//, /^\/actuator\//],
      },
    }),
  ],
  server: {
    host: true,
    // 터널(cloudflared 등)로 접속할 때 호스트 검사에 막히지 않게 한다. 개발 전용.
    allowedHosts: true,
    proxy: {
      // 서버 보류 중. 서버를 띄우면 앨범 웹(/a/{token})만 프록시. '/a' 접두어는 /attendance까지 잡으므로 정규식.
      '^/v1/': 'http://localhost:8080',
      '^/a/': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
