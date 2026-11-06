import type { MediaItem } from '../db/db';
import { saveCompressedVideo } from '../db/repo';
import { compressVideo } from './videoCompress';

// 보내기용 변환 결과 캐시. 같은 세션에서 토글을 껐다 켜도 다시 변환하지 않는다.
const photoCache = new Map<string, Blob>();
const videoCache = new Map<string, Blob>();

// 완성된 File 묶음 캐시. 카드가 다시 그려져도(보낸 아이 보기, 목록 이동) 준비 과정을 반복하지 않는다.
const fileCache = new Map<string, File[]>();
const fileInflight = new Map<string, Promise<File[]>>();
const videoInflight = new Map<string, Promise<Blob>>();
export function prepareKey(items: MediaItem[], dogName: string, date: string, compressPhoto: boolean, compressVideoFlag: boolean): string {
  return [dogName, date, compressPhoto ? 'p1' : 'p0', compressVideoFlag ? 'v1' : 'v0', ...items.map((m) => m.id)].join('|');
}
export function getPreparedFiles(key: string): File[] | undefined {
  return fileCache.get(key);
}

// 영상 변환은 재생 시간만큼 걸리고 무거우므로 한 번에 하나만 돌린다.
let videoQueue: Promise<unknown> = Promise.resolve();
function enqueueVideo<T>(fn: () => Promise<T>): Promise<T> {
  const run = videoQueue.then(fn, fn);
  videoQueue = run.catch(() => undefined);
  return run;
}

/**
 * 공유 시트로 파일 보내기 (Web Share API Level 2).
 * iOS 사파리 15+, 안드로이드 크롬 모두 카톡·문자·에어드롭 등으로 파일을 넘길 수 있다.
 * 반드시 사용자 탭 안에서 호출해야 하고, 한 번의 탭에 share()는 한 번만 된다.
 */

export type ShareResult = 'shared' | 'cancelled' | 'unsupported' | 'failed';
export type ShareOutcome = { result: ShareResult; detail?: string };

/** 이 기기의 공유 지원 상태. 화면 진단과 이벤트 속성에 쓴다. */
export function shareSupport(sample?: File[]): { hasShare: boolean; hasCanShare: boolean; canShareFiles: boolean | null; standalone: boolean } {
  const hasShare = typeof navigator.share === 'function';
  const hasCanShare = typeof navigator.canShare === 'function';
  let can: boolean | null = null;
  if (hasCanShare && sample && sample.length) { try { can = navigator.canShare({ files: sample }); } catch { can = false; } }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { hasShare, hasCanShare, canShareFiles: can, standalone };
}

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

export type PrepareProgress = { done: number; total: number; stage: 'photo' | 'video'; ratio?: number };

/**
 * 미디어를 File 객체로. 파일명은 강아지_날짜_순번.
 * compressPhoto면 사진 축소, compressVideoFlag면 영상 720p 재인코딩(느림, 순차).
 */
export type ShareEntry = { file: File; item: MediaItem };

/** 파일과 원본 항목을 짝지어 돌려준다. 발송 기록에 어떤 사진을 보냈는지 남기기 위해. */
export async function toShareBundle(
  items: MediaItem[],
  dogName: string,
  date: string,
  compressPhoto: boolean,
  compressVideoFlag: boolean,
  onProgress?: (p: PrepareProgress) => void,
): Promise<ShareEntry[]> {
  const files = await toShareFiles(items, dogName, date, compressPhoto, compressVideoFlag, onProgress);
  const withBlob = items.filter((m) => m.blob);
  return files.map((file, i) => ({ file, item: withBlob[i] }));
}

export async function toShareFiles(
  items: MediaItem[],
  dogName: string,
  date: string,
  compressPhoto: boolean,
  compressVideoFlag: boolean,
  onProgress?: (p: PrepareProgress) => void,
): Promise<File[]> {
  const key = prepareKey(items, dogName, date, compressPhoto, compressVideoFlag);
  const hit = fileCache.get(key);
  if (hit) return hit;
  // 같은 묶음을 동시에 두 번 준비하지 않는다 (카드가 다시 그려져도 진행 중인 작업에 합류).
  const running = fileInflight.get(key);
  if (running) {
    return running;
  }
  const work = prepareFiles(items, dogName, date, compressPhoto, compressVideoFlag, onProgress)
    .then((files) => { fileCache.set(key, files); return files; })
    .finally(() => fileInflight.delete(key));
  fileInflight.set(key, work);
  return work;
}

async function prepareFiles(
  items: MediaItem[],
  dogName: string,
  date: string,
  compressPhoto: boolean,
  compressVideoFlag: boolean,
  onProgress?: (p: PrepareProgress) => void,
): Promise<File[]> {
  const files: File[] = [];
  let i = 0;
  for (const m of items) {
    i++;
    if (!m.blob) continue;
    let blob = m.blob;
    let type = (m.mimeType || m.blob.type || (m.kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg')).split(';')[0];
    if (m.kind === 'PHOTO' && compressPhoto) {
      onProgress?.({ done: i - 1, total: items.length, stage: 'photo' });
      const cached = photoCache.get(m.id);
      if (cached) blob = cached;
      else {
        try { blob = await compressImage(m.blob); photoCache.set(m.id, blob); } catch { /* 실패하면 원본 */ }
      }
      type = 'image/jpeg';
    } else if (m.kind === 'VIDEO' && compressVideoFlag) {
      // 우선순위: 메모리 캐시 → DB에 저장된 변환본 → 진행 중인 변환에 합류 → 새 변환
      const cached = videoCache.get(m.id) ?? m.compressedBlob ?? null;
      if (cached) {
        blob = cached;
        videoCache.set(m.id, cached);
      } else {
        const original = m.blob;
        const idx = i;
        let job = videoInflight.get(m.id);
        if (!job) {
          job = enqueueVideo(() =>
            compressVideo(original, { onProgress: (ratio) => onProgress?.({ done: idx - 1, total: items.length, stage: 'video', ratio }) }),
          )
            .then(async (r) => {
              const out = r.blob.size > 0 && r.blob.size < original.size ? r.blob : original; // 더 커지면 원본 유지
              videoCache.set(m.id, out);
              try { await saveCompressedVideo(m.id, out); } catch { /* 저장 실패해도 메모리 캐시로 동작 */ }
              return out;
            })
            .finally(() => videoInflight.delete(m.id));
          videoInflight.set(m.id, job);
        } else {
          onProgress?.({ done: idx - 1, total: items.length, stage: 'video', ratio: 0 });
        }
        try { blob = await job; } catch { /* 변환 실패면 원본 */ }
      }
      type = blob.type.split(';')[0] || type;
    }
    const ext = EXT[type] ?? (m.kind === 'VIDEO' ? 'mp4' : 'jpg');
    files.push(new File([blob], `${dogName}_${date}_${String(i).padStart(2, '0')}.${ext}`, { type }));
    onProgress?.({ done: i, total: items.length, stage: m.kind === 'VIDEO' ? 'video' : 'photo' });
  }
  return files;
}

export function canShareFiles(files: File[]): boolean {
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files });
}

/**
 * 공유 시트 열기. canShare가 false여도 share()를 한 번은 시도한다.
 * (iOS 홈 화면 앱에서 canShare({files})가 false를 돌려주면서 share는 되는 경우가 있다.)
 * 파일 공유가 TypeError로 거부되면 파일 없이(제목·본문만) 한 번 더 시도하지 않고 unsupported로 알린다.
 */
export async function shareFilesDetailed(files: File[], title: string, text: string): Promise<ShareOutcome> {
  if (typeof navigator.share !== 'function') return { result: 'unsupported', detail: 'navigator.share 없음' };
  try {
    await navigator.share({ files, title, text });
    return { result: 'shared' };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? 'Error';
    const message = (e as { message?: string })?.message ?? '';
    if (name === 'AbortError') return { result: 'cancelled' };
    // 파일 공유 자체를 못 하는 환경: TypeError / NotAllowedError(권한·제스처) / DataError
    if (name === 'TypeError' || name === 'NotAllowedError' || name === 'DataError') return { result: 'unsupported', detail: `${name}: ${message}` };
    return { result: 'failed', detail: `${name}: ${message}` };
  }
}

export async function shareFiles(files: File[], title: string, text: string): Promise<ShareResult> {
  return (await shareFilesDetailed(files, title, text)).result;
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
export function splitBatches<T extends { file: File } | File>(entries: T[], maxFiles = 15, maxBytes = 150 * 1024 * 1024): T[][] {
  const sizeOf = (e: T) => (e instanceof File ? e.size : e.file.size);
  const batches: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const e of entries) {
    if (cur.length > 0 && (cur.length >= maxFiles || bytes + sizeOf(e) > maxBytes)) {
      batches.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(e);
    bytes += sizeOf(e);
  }
  if (cur.length > 0) batches.push(cur);
  return batches;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
