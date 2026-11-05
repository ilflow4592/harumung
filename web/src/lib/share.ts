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

/** 보내기용 사진 축소. 긴 변 maxSide, JPEG. 4K 원본 3~5MB → 0.5MB 안팎. 영상은 손대지 않는다. */
export async function compressImage(blob: Blob, maxSide = 2048, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && blob.type === 'image/jpeg' && blob.size < 1.5 * 1024 * 1024) { bitmap.close(); return blob; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return blob; }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', quality));
}

/** 미디어를 File 객체로. 파일명은 강아지_날짜_순번. compress면 사진을 축소한다. */
export async function toShareFiles(
  items: MediaItem[],
  dogName: string,
  date: string,
  compress: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<File[]> {
  const files: File[] = [];
  let i = 0;
  for (const m of items) {
    i++;
    if (!m.blob) continue;
    let blob = m.blob;
    let type = (m.mimeType || m.blob.type || (m.kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg')).split(';')[0];
    if (compress && m.kind === 'PHOTO') {
      try { blob = await compressImage(m.blob); type = 'image/jpeg'; } catch { /* 실패하면 원본 */ }
    }
    const ext = EXT[type] ?? (m.kind === 'VIDEO' ? 'mp4' : 'jpg');
    files.push(new File([blob], `${dogName}_${date}_${String(i).padStart(2, '0')}.${ext}`, { type }));
    onProgress?.(i, items.length);
  }
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
