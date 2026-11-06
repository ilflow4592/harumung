/**
 * PostHog 이벤트·세션 녹화. 키가 없으면 전부 no-op.
 * - 세션 녹화: 입력값 전부 마스킹, .ph-mask 텍스트 마스킹. 사진·카메라는 DOM 녹화라 원래 안 잡힌다.
 * - 기기 식별: 로그인이 없으므로 PostHog 익명 id. 설치 상태·플랫폼·앱 버전은 super property.
 */
import posthog from 'posthog-js';

import { isIOS, isStandalone } from './settings';

export const APP_VERSION = '0.1';
let enabled = false;

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
  posthog.init(key, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com',
    capture_pageview: false, // SPA라 라우터에서 직접
    capture_pageleave: true,
    autocapture: false, // 의미 있는 이벤트만 수동 태깅
    persistence: 'localStorage+cookie',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '.ph-mask',
      blockSelector: 'video, canvas',
    },
    loaded: () => {
      posthog.register({
        app_version: APP_VERSION,
        platform: isIOS ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'other',
        standalone: isStandalone(),
        dev: import.meta.env.DEV,
      });
    },
  });
  enabled = true;
}

type Props = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props?: Props): void {
  if (!enabled) return;
  try { posthog.capture(event, props); } catch { /* 추적 실패는 앱 동작에 영향 없음 */ }
}

export function trackPageview(path: string): void {
  if (!enabled) return;
  const screen = path.split('?')[0].replace(/\/[0-9A-Z]{26}(?=\/|$)/g, '/:id'); // ULID 경로 일반화
  try { posthog.capture('$pageview', { $current_url: window.location.href, screen }); } catch { /* 무시 */ }
}

/** 설치 상태가 바뀌었을 수 있으니 앱 열 때마다 갱신. */
export function refreshPersonProps(extra?: Props): void {
  if (!enabled) return;
  try { posthog.people.set({ standalone: isStandalone(), app_version: APP_VERSION, ...extra }); } catch { /* 무시 */ }
}

/** 소요 시간 측정용. */
export function timer(): () => number {
  const t0 = performance.now();
  return () => Math.round(performance.now() - t0);
}
