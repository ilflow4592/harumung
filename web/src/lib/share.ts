import type { MediaItem } from '../db/db';

/**
 * 공유 시트로 파일 보내기 (Web Share API Level 2).
 * iOS 사파리 15+, 안드로이드 크롬 모두 카톡·문자·에어드롭 등으로 파일을 넘길 수 있다.
 * 반드시 사용자 탭 안에서 호출해야 하고, 한 번의 탭에 share()는 한 번만 된다.
 */

export type ShareResult = 'shared' | 'cancelled' | 'unsupported' | 'failed';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

/** 미디어를 File 객체로. 파일명은 강아지_날짜_순번. */
export function toShareFiles(items: MediaItem[], dogName: string, date: string): File[] {
  const files: File[] = [];
  items.forEach((m, i) => {
    if (!m.blob) return;
    const type = m.mimeType || m.blob.type || (m.kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg');
    const base = type.split(';')[0];
    const ext = EXT[base] ?? (m.kind === 'VIDEO' ? 'mp4' : 'jpg');
    files.push(new File([m.blob], `${dogName}_${date}_${String(i + 1).padStart(2, '0')}.${ext}`, { type: base }));
  });
  return files;
}

export function canShareFiles(files: File[]): boolean {
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files });
}

export async function shareFiles(files: File[], title: string, text: string): Promise<ShareResult> {
  if (!canShareFiles(files)) return 'unsupported';
  try {
    await navigator.share({ files, title, text });
    return 'shared';
  } catch (e) {
    const name = (e as { name?: string })?.name;
    return name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** 공유 미지원 브라우저용: 파일을 하나씩 다운로드. */
export function downloadFiles(files: File[]): void {
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** 한 번에 넘기기엔 큰 묶음을 나눈다. iOS는 파일 수·용량이 크면 공유가 실패한다. */
export function splitBatches(files: File[], maxFiles = 15, maxBytes = 150 * 1024 * 1024): File[][] {
  const batches: File[][] = [];
  let cur: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (cur.length > 0 && (cur.length >= maxFiles || bytes + f.size > maxBytes)) {
      batches.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += f.size;
  }
  if (cur.length > 0) batches.push(cur);
  return batches;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
