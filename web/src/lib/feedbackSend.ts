/**
 * 피드백 전송. 서버가 없으므로 PostHog 이벤트 `feedback`로 보낸다 (제목·내용·유형·화면 + 축소한 사진 최대 3장).
 * PostHog는 이벤트 1건이 1MB를 넘으면 버리므로 사진 합계를 700KB 아래로 맞춘다.
 */
import posthog from 'posthog-js';

export const FEEDBACK_TYPES = [
  { value: 'bug', label: '오류·안 됨' },
  { value: 'friction', label: '불편한 점' },
  { value: 'idea', label: '있었으면 하는 기능' },
  { value: 'praise', label: '좋았던 점' },
  { value: 'other', label: '기타' },
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]['value'];

const MAX_PHOTOS = 3;
const TOTAL_BUDGET = 700 * 1024;

/** 긴 변 maxSide, JPEG 품질 q 로 줄여 data URL. */
async function shrink(file: Blob, maxSide: number, q: number): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', q);
}

/** 사진들을 예산 안에 들어올 때까지 단계적으로 줄인다. */
export async function preparePhotos(files: Blob[]): Promise<string[]> {
  const picked = files.slice(0, MAX_PHOTOS);
  const steps: [number, number][] = [[1024, 0.7], [800, 0.6], [640, 0.5], [480, 0.45]];
  for (const [side, q] of steps) {
    const urls = await Promise.all(picked.map((f) => shrink(f, side, q)));
    const bytes = urls.reduce((n, u) => n + u.length * 0.75, 0);
    if (bytes <= TOTAL_BUDGET) return urls;
  }
  return Promise.all(picked.map((f) => shrink(f, 400, 0.4)));
}

export type FeedbackInput = { type: FeedbackType; title: string; body: string; photos: string[]; screen: string };

const SENT_KEY = 'harumung.feedback.sent';
export type SentFeedback = { at: string; type: FeedbackType; title: string; photos: number };

export function listSentFeedback(): SentFeedback[] {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]'); } catch { return []; }
}

/** 전송. PostHog가 꺼져 있으면(키 없음) false. */
export function sendFeedback(input: FeedbackInput): boolean {
  const enabled = !!(import.meta.env.VITE_POSTHOG_KEY as string | undefined);
  if (enabled) {
    posthog.capture('feedback', {
      feedback_type: input.type,
      title: input.title || null,
      body: input.body,
      screen: input.screen,
      photo_count: input.photos.length,
      photo_1: input.photos[0] ?? null,
      photo_2: input.photos[1] ?? null,
      photo_3: input.photos[2] ?? null,
      ua: navigator.userAgent,
    });
  }
  try {
    const list = listSentFeedback();
    list.unshift({ at: new Date().toISOString(), type: input.type, title: input.title, photos: input.photos.length });
    localStorage.setItem(SENT_KEY, JSON.stringify(list.slice(0, 50)));
  } catch { /* 무시 */ }
  return enabled;
}
